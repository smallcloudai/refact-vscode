/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
import * as userLogin from "./userLogin";
import * as estate from "./estate";
import * as storeVersions from "./storeVersions";
import * as usageStats from "./usageStats";
import * as privacy from "./privacy";


class CacheEntry {
    public completion;
    public created_ts;
    public serial_number;
    public constructor(completion: string, created_ts: number, serial_number: number) {
        this.completion = completion;
        this.created_ts = created_ts;
        this.serial_number = serial_number;
    }
};

const CACHE_STORE = 160;
const CACHE_AHEAD = 50;
const CACHE_KEY_LINES = 50;


let _global_serial_number = 5000;

let _completion_data_feedback_candidate = new estate.ApiFields();


export class MyInlineCompletionProvider implements vscode.InlineCompletionItemProvider
{
    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        cancelToken: vscode.CancellationToken
    )
    {
        let state = estate.state_of_document(document);
        if (state) {
            if (state.get_mode() !== estate.Mode.Normal && state.get_mode() !== estate.Mode.Highlight) {
                return [];
            }
        }
        let access_level = await privacy.get_file_access(document.fileName);
        if (access_level < 1) {
            return [];
        }
        let pause_completion = vscode.workspace.getConfiguration().get('refactai.pauseCompletion');
        if (pause_completion && context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
            return [];
        }

        let file_name = storeVersions.filename_from_document(document);
        let current_line = document.lineAt(position.line);
        let left_of_cursor = current_line.text.substring(0, position.character);
        let right_of_cursor = current_line.text.substring(position.character);
        let right_of_cursor_has_only_special_chars = Boolean(right_of_cursor.match(/^[:\s\t\n\r(){},."'\];]*$/));
        if (!right_of_cursor_has_only_special_chars) {
            return [];
        }
        let multiline = left_of_cursor.replace(/\s/g, "").length === 0;
        let whole_doc = document.getText();
        if (whole_doc.length > 180*1024) { // Too big (180k is ~0.2% of all files on our dataset) everything becomes heavy: network traffic, cache, cpu
            return [];
        }

        let debounce_if_not_cached = context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic;
        let called_manually = context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke;

        let completion = "";
        let this_completion_serial_number = -1;
        let cursor_character = multiline ? 0 : position.character;

        let cache_key = "";
        for (let i = -CACHE_KEY_LINES; i <= 0 ; i++) {
            if (position.line + i < 0) {
                continue;
            }
            let line = document.lineAt(position.line + i);
            if (i < 0) {
                cache_key += line.text + "\n";
            } else {
                cache_key += line.text.substring(0, cursor_character);
            }
        }

        [completion, this_completion_serial_number] = await this.cached_request(
            cancelToken,
            cache_key,
            file_name,
            whole_doc,
            position.line,
            cursor_character,
            debounce_if_not_cached,
            multiline,
            called_manually,
        );

        if (completion && _completion_data_feedback_candidate.serial_number === this_completion_serial_number && _completion_data_feedback_candidate.ts_presented === 0) {
            _completion_data_feedback_candidate.ts_presented = Date.now();
        }

        let command = {
            command: "refactaicmd.inlineAccepted",
            title: "inlineAccepted",
            arguments: [this_completion_serial_number],
        };

        let replace_range0 = new vscode.Position(position.line, position.character);
        let replace_range1 = new vscode.Position(position.line, current_line.text.length);
        if (multiline) {
            replace_range0 = new vscode.Position(position.line, 0);
        }
        console.log(["completion", completion, "replace_range0", replace_range0, "replace_range1", replace_range1]);
        let completionItem = new vscode.InlineCompletionItem(
            completion,
            // new vscode.Range(position.translate(0, -deleted_spaces_left), eol_pos),
            new vscode.Range(replace_range0, replace_range1),
            command,
        );
        return [completionItem];
    }

    public cache: Map<string, CacheEntry> = new Map();  // LRUCache?
    public slowdown_rapidfire_ts = 0;
    public slowdown_rapidfire_count = 0;
    public slowdown_sustained_ts = 0;
    public slowdown_sustained_count = 0;

    public cleanup_cache()
    {
        while (1) {
            if (this.cache.size < CACHE_STORE) {
                return;
            }
            let oldest_key: any = null;
            let oldest_ts = null;
            for (let [key, value] of this.cache) {
                if (oldest_ts === null || value.created_ts < oldest_ts) {
                    oldest_ts = value.created_ts;
                    oldest_key = key;
                }
            }
            if (oldest_key === null) {
                return;
            }
            this.cache.delete(oldest_key);
        }
    }

    async slowdown(cancelToken: vscode.CancellationToken): Promise<boolean>
    {
        const ALLOWED_RATE_RAPIDFIRE = 2.0;
        const ALLOWED_RATE_SUSTAINED = 1.0;  // requests per second
        while (1) {
            await fetch.wait_until_all_requests_finished();
            if (cancelToken.isCancellationRequested) {
                return true;
            }
            let now = Date.now();
            let rapid_rate = this.slowdown_rapidfire_count / ((now - this.slowdown_rapidfire_ts) / 1000.0);
            let sustained_rate = this.slowdown_sustained_count / ((now - this.slowdown_sustained_ts) / 1000.0);
            if (rapid_rate > ALLOWED_RATE_RAPIDFIRE || sustained_rate > ALLOWED_RATE_SUSTAINED) {
                // console.log("slowdown, rapid=" + rapid_rate + ", sustained=" + sustained_rate);
                let sleep = 100;
                await new Promise(resolve => setTimeout(resolve, sleep));
            } else {
                // console.log("go ahead, rapid=" + rapid_rate + ", sustained=" + sustained_rate);
                break;
            }
        }
        let now = Date.now();
        if (now - this.slowdown_rapidfire_ts > 500) {
            // 2*0.5=1 request in 0.5 seconds -- it's there to prevent a wi-fi lag from forming a pile of requests
            this.slowdown_rapidfire_ts = now;
            this.slowdown_rapidfire_count = 0;
        }
        if (now - this.slowdown_sustained_ts > 20000) {
            // reset every 20 seconds
            this.slowdown_sustained_ts = now;
            this.slowdown_sustained_count = 0;
        }
        this.slowdown_rapidfire_count += 1;
        this.slowdown_sustained_count += 1;
        return false;
    }

    async cached_request(
        cancelToken: vscode.CancellationToken,
        cache_key: string,
        file_name: string,
        whole_doc: string,
        cursor_line: number,
        cursor_character: number,
        debounce_if_not_cached: boolean,
        multiline: boolean,
        called_manually: boolean
    ): Promise<[string, number]>
    {
        let cached = this.cache.get(cache_key);
        if (cached !== undefined && !called_manually) {
            return [cached.completion, cached.serial_number];
        }
        let login: any = await userLogin.inference_login();
        if (!login) { return ["", -1]; }
        if (debounce_if_not_cached) {
            let drop = await this.slowdown(cancelToken);
            if (drop) { return ["", -1]; }
        }

        let request = new fetch.PendingRequest(undefined, cancelToken);
        let max_tokens = 50;
        let sources: { [key: string]: string } = {};
        sources[file_name] = whole_doc;

        let t0 = Date.now();
        let promise: any;
        let api_fields: estate.ApiFields;
        [promise, api_fields] = fetch.fetch_code_completion(
            cancelToken,
            sources,
            multiline,
            file_name,
            cursor_line,
            cursor_character,
            max_tokens,
        );
        _completion_data_feedback_candidate = api_fields;
        _completion_data_feedback_candidate.serial_number = _global_serial_number;
        _global_serial_number += 1;
        request.supply_stream(promise, api_fields);
        let json: any;
        json = await request.apiPromise;
        if (json === undefined) {
            return ["", -1];
        }
        let t1 = Date.now();
        let ms_int = Math.round(t1 - t0);
        console.log([`API request ${ms_int}ms`]);

        let completion = json[0]["code_completion"];
        let de_facto_model = json[0]["model"];
        _completion_data_feedback_candidate.grey_text_explicitly = completion;
        _completion_data_feedback_candidate.de_facto_model = de_facto_model;
        for (let i = 0; i < Math.min(completion.length + 1, CACHE_AHEAD); i++) {
            let longer_key = cache_key + completion.substring(0, i);
            this.cache.set(longer_key, {
                completion: completion.substring(i),
                created_ts: Date.now(),
                serial_number: _completion_data_feedback_candidate.serial_number,
            });
            if (completion.substring(i) === "\n") {
                break;
            }
        }
        this.cleanup_cache();
        return [completion, _completion_data_feedback_candidate.serial_number];
    }
}

export function _extract_extension(feed: estate.ApiFields)
{
    let filename_ext = feed.cursor_file.split(".");
    let ext = "None";
    if (filename_ext.length > 1) {
        let try_this = filename_ext[filename_ext.length - 1];
        if (try_this.length <= 4) {
            ext = try_this;
        }
    }
    return ext;
}


export function inline_accepted(serial_number: number)
{
    let feed: estate.ApiFields = _completion_data_feedback_candidate;
    if (!feed || feed.serial_number !== serial_number) {
        return;
    }
    if (feed.ts_presented === 0) {
        return;
    }
    if (feed.ts_reacted) {
        return;
    }
    let ext = _extract_extension(feed);
    usageStats.report_increase_tab_stats(
        feed,
        ext,
        vscode.extensions.getExtension('vscode.git'),
    );

    feed.ts_reacted = Date.now();
    let ponder_time_ms = feed.ts_reacted - feed.ts_presented;
    let req_to_react_ms = feed.ts_reacted - feed.ts_req;
    console.log(["inline_accepted", serial_number, "ponder_time_ms", ponder_time_ms, "req_to_react_ms", req_to_react_ms]);
    usageStats.report_increase_a_counter("completion", "metric0ms_tab");
    usageStats.report_increase_a_counter("completion", "metric0ms_tab:" + ext);
    if (ponder_time_ms > 600) {
        usageStats.report_increase_a_counter("completion", "metric600ms_tab");
        usageStats.report_increase_a_counter("completion", "metric600ms_tab:" + ext);
    }
    if (ponder_time_ms > 1200) {
        usageStats.report_increase_a_counter("completion", "metric1200ms_tab");
        usageStats.report_increase_a_counter("completion", "metric1200ms_tab:" + ext);
    }
}


export function inline_rejected(reason: string)
{
    let feed: estate.ApiFields = _completion_data_feedback_candidate;
    if (feed.ts_presented === 0) {
        return;
    }
    if (feed.ts_reacted) {
        return;
    }
    feed.ts_reacted = Date.now();
    let ponder_time_ms = feed.ts_reacted - feed.ts_presented;
    let req_to_react_ms = feed.ts_reacted - feed.ts_req;
    console.log(["inline_rejected", reason, "ponder_time_ms", ponder_time_ms, "req_to_react_ms", req_to_react_ms]);
    let ext = _extract_extension(feed);
    usageStats.report_increase_a_counter("completion", "metric0ms_" + reason);
    usageStats.report_increase_a_counter("completion", "metric0ms_" + reason + ":" + ext);
    if (ponder_time_ms > 600) {
        usageStats.report_increase_a_counter("completion", "metric600ms_" + reason);
        usageStats.report_increase_a_counter("completion", "metric600ms_" + reason + ":" + ext);
    }
    if (ponder_time_ms > 1200) {
        usageStats.report_increase_a_counter("completion", "metric1200ms_" + reason);
        usageStats.report_increase_a_counter("completion", "metric1200ms_" + reason + ":" + ext);
    }
}


export function on_cursor_moved()
{
    setTimeout(() => {
        inline_rejected("moveaway");
    }, 50);
}


export function on_text_edited()
{
    setTimeout(() => {
        inline_rejected("moveaway");
    }, 50);
}


export function on_esc_pressed()
{
    inline_rejected("esc");
}

/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
import * as userLogin from "./userLogin";
import * as estate from "./estate";
import * as storeVersions from "./storeVersions";
import * as codeLens from "./codeLens";
import * as crlf from "./crlf";
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
        let cursor_dirty = document.offsetAt(position);  // dirty because the \r are counted and emojis are 2 chars
        let cursors_cleaned_cr: number[], cursors_transmit: number[];
        [whole_doc, cursors_cleaned_cr, cursors_transmit] = crlf.cleanup_cr_lf(whole_doc, [cursor_dirty]);
        let cursor_cr = cursors_cleaned_cr[0];
        let cursor_transmit = cursors_transmit[0];
        let text_left = whole_doc.substring(0, cursor_cr);

        if (whole_doc.length > 0 && whole_doc[whole_doc.length - 1] !== "\n") {
            whole_doc += "\n";
        }
        let deleted_spaces_left = 0;
        while (multiline && text_left.length > 0 && (text_left[text_left.length - 1] === " " || text_left[text_left.length - 1] === "\t")) {
            text_left = text_left.substring(0, text_left.length - 1);
            cursor_cr -= 1;
            cursor_transmit -= 1;
            deleted_spaces_left += 1;
        }
        let eol_pos = new vscode.Position(position.line, current_line.text.length);
        whole_doc = text_left + whole_doc.substring(cursor_cr);

        let delay_if_not_cached = context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic;

        let completion = "";
        let this_completion_serial_number = -1;
        if (state) {
            let third_party = Boolean(state.completion_longthink && multiline);
            // let third_party = false;
            [completion, this_completion_serial_number] = await this.cached_request(
                state,
                cancelToken,
                delay_if_not_cached,
                file_name,
                whole_doc,
                cursor_cr,
                cursor_transmit,
                multiline,
                third_party
            );
            if (third_party) {
                state.completion_reset_on_cursor_movement = true;
            }
        }

        if (state) {
            if (state && completion && multiline) {
                state.completion_lens_pos = position.line;
            } else {
                state.completion_lens_pos = Number.MAX_SAFE_INTEGER;
            }
            vscode.commands.executeCommand('setContext', 'refactcx.runEsc', true);
            codeLens.quick_refresh();
        }

        if (completion && _completion_data_feedback_candidate.serial_number === this_completion_serial_number && _completion_data_feedback_candidate.ts_presented === 0) {
            _completion_data_feedback_candidate.ts_presented = Date.now();
        }

        let command = {
            command: "refactaicmd.inlineAccepted",
            title: "inlineAccepted",
            arguments: [this_completion_serial_number],
        };

        // Undocumented brittle functionality, it's hard to describe what InlineCompletionItem exactly does, trial and error...
        let completionItem = new vscode.InlineCompletionItem(
            completion,
            // new vscode.Range(position, position.translate(0, completion_length))
            new vscode.Range(position.translate(0, -deleted_spaces_left), eol_pos),
            // new vscode.Range(position, eol_pos.translate(0, 1))
               //.translate(0, completion_length))
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
            this.slowdown_sustained_ts = now;
            this.slowdown_sustained_count = 0;
        }
        this.slowdown_rapidfire_count += 1;
        this.slowdown_sustained_count += 1;
        return false;
    }

    async cached_request(
        state: estate.StateOfEditor,
        cancelToken: vscode.CancellationToken,
        delay_if_not_cached: boolean,
        file_name: string,
        whole_doc: string,
        cursor_cr: number,
        cursor_transmit: number,
        multiline: boolean,
        third_party: boolean,
    ): Promise<[string, number]>
    {
        let left = whole_doc.substring(0, cursor_cr);
        let cached = this.cache.get(left);
        if (cached !== undefined && !third_party) {
            return [cached.completion, cached.serial_number];
        }
        let login: any = await userLogin.inference_login();
        if (!login) { return ["", -1]; }
        if (delay_if_not_cached) {
            let drop = await this.slowdown(cancelToken);
            if (drop) { return ["", -1]; }
        }

        let request = new fetch.PendingRequest(undefined, cancelToken);
        let max_tokens = 50;
        let max_edits = 1;
        let sources: { [key: string]: string } = {};
        sources[file_name] = whole_doc;
        let stop_tokens: string[];
        if (multiline) {
            stop_tokens = ["\n\n"];
        } else {
            stop_tokens = ["\n", "\n\n"];
        }
        let fail = false;
        let stop_at = cursor_cr;
        let modif_doc = whole_doc;
        let backward_cache = "";

        if (!fail) {
            let t0 = Date.now();
            let promise: any;
            let stream = false;
            let api_fields: estate.ApiFields;
            if (third_party) {
                let use_model = "longthink/stable";
                let func = "completion-gpt3.5";
                // TODO: let the user choose
                if (global.longthink_functions_today) {
                    const keys = Object.keys(global.longthink_functions_today);
                    for (let i = 0; i < keys.length; i++) {
                        let key = keys[i];
                        if (key.includes("completion-")) {
                            let function_dict = global.longthink_functions_today[key];
                            use_model = function_dict.model;
                            func = function_dict.function_name;
                        }
                    }
                }
                max_tokens = 200;
                [promise, api_fields] = fetch.fetch_api_promise(
                    cancelToken,
                    "completion:" + func, // scope
                    sources,
                    "Infill", // intent
                    func,
                    file_name,
                    cursor_transmit,
                    cursor_transmit,
                    max_tokens,
                    max_edits,
                    stop_tokens,
                    stream,
                    use_model,
                    third_party,
                );
            } else {
                [promise, api_fields] = fetch.fetch_api_promise(
                    cancelToken,
                    "completion", // scope
                    sources,
                    "Infill", // intent
                    "infill", // scratchpad function
                    file_name,
                    cursor_transmit,
                    cursor_transmit,
                    max_tokens,
                    max_edits,
                    stop_tokens,
                    stream,
                    "",
                    third_party,
                );
            }
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
            modif_doc = json["choices"][0]["files"][file_name];
            let before_cursor1 = whole_doc.substring(0, cursor_cr);
            let before_cursor2 = modif_doc.substring(0, cursor_cr);
            backward_cache = json["backward_cache"] || "";
            if (before_cursor1 !== before_cursor2) {
                console.log("completion before_cursor1 != before_cursor2");
                return ["", -1];
            }
            stop_at = 0;
            let any_different = false;
            for (let i = -1; i > -whole_doc.length; i--) {
                let char1 = whole_doc.slice(i, i + 1);
                let char2 = modif_doc.slice(i, i + 1);
                if (char1 === "\n") {
                    stop_at = i + 1;
                }
                if (char1 !== char2) {
                    //stop_at = i + 1;
                    any_different = true;
                    break;
                }
            }
            fail = !any_different;
        }
        let completion = "";
        if (!fail) {
            fail = cursor_cr >= modif_doc.length + stop_at;
            if (fail) {
                console.log([`completion modified before cursor ${cursor_cr} < ${modif_doc.length + stop_at}`]);
                let whole_doc2 = whole_doc.substring(0, cursor_cr);
                let modif_doc2 = modif_doc.substring(0, cursor_cr);
                if (whole_doc2 !== modif_doc2) {
                    console.log(["whole_doc2", whole_doc2]);
                    console.log(["modif_doc2", modif_doc2]);
                }
                let after_cursor_real = whole_doc.substring(cursor_cr);
                let after_cursor_alternative = modif_doc.substring(modif_doc.length + stop_at);
                if (after_cursor_real !== after_cursor_alternative) {
                    console.log(["after_cursor_real", after_cursor_real]);
                    console.log(["after_cursor_alternative", after_cursor_alternative]);
                }
            }
        }
        if (!fail) {
            completion = modif_doc.substring(cursor_cr, modif_doc.length + stop_at);
            // console.log(["completion success", request.seq, completion]);
        }
        if (!fail && !multiline) {
            completion = completion.replace(/\s+$/, "");
            fail = completion.match(/\n/g) !== null;
        } else if (!fail && multiline) {
            completion = completion.replace(/[ \t\n]+$/, "");
        }
        if (!fail) {
            fail = completion.length === 0;
        }
        if (third_party) {
            // dont cache third party
            return [completion, _completion_data_feedback_candidate.serial_number];
        }
        for (let i = 0; i < Math.min(completion.length + 1, CACHE_AHEAD); i++) {
            let more_left = left + completion.substring(0, i);
            this.cache.set(more_left, {
                completion: completion.substring(i),
                created_ts: Date.now(),
                serial_number: _completion_data_feedback_candidate.serial_number,
            });
        }
        for (let i = 1; i < Math.min(backward_cache.length, CACHE_AHEAD); i++) {
            let less_left = left.substring(0, left.length - i);
            let cut = left.substring(left.length - i);
            if (cut !== backward_cache.substring(backward_cache.length - i)) {
                console.log(["backward cache problem, cut", cut, "backward_cache", backward_cache.substring(backward_cache.length - i)]);
                continue;
            }
            this.cache.set(less_left, {
                completion: cut + completion,
                created_ts: Date.now(),
                serial_number: _completion_data_feedback_candidate.serial_number,
            });
        }
        this.cleanup_cache();
        return [completion, _completion_data_feedback_candidate.serial_number];
    }
}


function _extract_extension(feed: estate.ApiFields)
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
    feed.ts_reacted = Date.now();
    let ponder_time_ms = feed.ts_reacted - feed.ts_presented;
    let req_to_react_ms = feed.ts_reacted - feed.ts_req;
    console.log(["inline_accepted", serial_number, "ponder_time_ms", ponder_time_ms, "req_to_react_ms", req_to_react_ms]);
    let ext = _extract_extension(feed);
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

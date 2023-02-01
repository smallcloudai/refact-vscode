/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
import * as userLogin from "./userLogin";
import * as estate from "./estate";
import * as storeVersions from "./storeVersions";
import * as codeLens from "./codeLens";
import * as crlf from "./crlf";


class CacheEntry {
    public completion;
    public created_ts;
    public constructor(completion: string, created_ts: number) {
        this.completion = completion;
        this.created_ts = created_ts;
    }
};

const CACHE_STORE = 160;
const CACHE_AHEAD = 50;


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
        if (!estate.is_lang_enabled(document)) {
            return [];
        }
        let file_name = storeVersions.filename_from_document(document);
        let current_line = document.lineAt(position.line);
        let left_of_cursor = current_line.text.substring(0, position.character);
        let right_of_cursor = current_line.text.substring(position.character);
        let right_of_cursor_has_only_special_chars = Boolean(right_of_cursor.match(/^[:\s\t\n\r(),."'\]]*$/));
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
        if (state) {
            completion = await this.cached_request(
                cancelToken,
                delay_if_not_cached,
                file_name,
                whole_doc,
                cursor_cr,
                cursor_transmit,
                multiline,
                Boolean(state.completion_longthink && multiline),
            );
        }

        if (state) {
            if  (state && completion && multiline) {
                state.completion_lens_pos = position.line;
                vscode.commands.executeCommand('setContext', 'codify.runEsc', true);
            } else {
                state.completion_lens_pos = Number.MAX_SAFE_INTEGER;
            }
            codeLens.quick_refresh();
        }

        let command = {
            command: "plugin-vscode.inlineAccepted",
            title: "inlineAccepted",
            arguments: []
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

    async cached_request(
        cancelToken: vscode.CancellationToken,
        delay_if_not_cached: boolean,
        file_name: string,
        whole_doc: string,
        cursor_cr: number,
        cursor_transmit: number,
        multiline: boolean,
        third_party: boolean = false,
    ): Promise<string>
    {
        let left = whole_doc.substring(0, cursor_cr);
        let cached = this.cache.get(left);
        if (cached !== undefined && !third_party) {
            return cached.completion;
        }
        if (delay_if_not_cached) {
            let sleep = 30;  // In a hope this request will be cancelled
            await new Promise(resolve => setTimeout(resolve, sleep));
        }
        let login: any = await userLogin.inference_login();
        if (!login) { return ""; }
        await fetch.wait_until_all_requests_finished();
        if (cancelToken.isCancellationRequested) {
            return "";
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
            let stream = false;
            if (third_party) {
                request.supply_stream(...fetch.fetch_api_promise(
                    cancelToken,
                    "completion", // scope
                    sources,
                    "Infill", // intent
                    "complete-selected-code",
                    file_name,
                    cursor_transmit,
                    cursor_transmit,
                    max_tokens,
                    max_edits,
                    stop_tokens,
                    stream,
                    "longthink/experimental"
                ));
            } else {
                request.supply_stream(...fetch.fetch_api_promise(
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
                ));
            }
            let json: any;
            json = await request.apiPromise;
            if (json === undefined) {
                return "";
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
                return "";
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
            console.log(["completion success", request.seq, completion]);
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
        for (let i = 0; i < Math.min(completion.length + 1, CACHE_AHEAD); i++) {
            let more_left = left + completion.substring(0, i);
            this.cache.set(more_left, {
                completion: completion.substring(i),
                created_ts: Date.now(),
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
            });
        }
        this.cleanup_cache();
        return completion;
    }
}

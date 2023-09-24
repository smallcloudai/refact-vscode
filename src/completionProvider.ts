/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
import * as userLogin from "./userLogin";
import * as estate from "./estate";
import * as storeVersions from "./storeVersions";
import * as usageStats from "./usageStats";
import * as privacy from "./privacy";
import * as completionMetrics from "./completionMetrics";
import * as dataCollection from "./dataCollection";


    // public async verify_completion_still_present_in_text()
    // {
    //     if (!this.document) {
    //         return;
    //     }
    //     let t0 = Date.now();
    //     let text_orig = this.sources[this.cursor_file];
    //     let text_compl = this.results[this.cursor_file];  // completion applied
    //     let test_uedit = this.document.getText();         // user edited
    //     //  orig1    orig1    orig1
    //     //  orig2    orig2    orig2
    //     //  |        comp1    comp1
    //     //  orig3    comp2    edit
    //     //  orig4    comp3    comp3
    //     //  orig5    orig3    orig3
    //     //           orig4    orig4
    //     // -------------------------------
    //     // Goal: diff orig vs compl, orig vs uedit. If head and tail are the same, then user edit is valid and useful.
    //     // Memorize the last valid user edit. At the point it becomes invalid, save feedback and forget.
    //     let t1 = Date.now();
    //     let [valid1, gray_suggested] = completionMetrics.if_head_tail_equal_return_added_text(text_orig, text_compl);
    //     let [valid2, gray_edited] = completionMetrics.if_head_tail_equal_return_added_text(text_orig, test_uedit);
    //     let t2 = Date.now();
    //     let taking_too_long = (Date.now() - this.ts_presented) > 1000 * 60 * 2;  // 2 minutes
    //     console.log([this.serial_number, "valid1", valid1, "valid2", valid2, "taking_too_long", taking_too_long]);
    //     if (valid1 && valid2 && !taking_too_long) {
    //         let gray_suggested_split = gray_suggested.split(/\r?\n/);
    //         for (let i = 0; i < gray_suggested_split.length; i++) {
    //             console.log(["suggested", gray_suggested_split[i]]);
    //         }
    //         let gray_edited_split = gray_edited.split(/\r?\n/);
    //         for (let i = 0; i < gray_edited_split.length; i++) {
    //             console.log(["edited", gray_edited_split[i]]);
    //         }
    //         let gray_suggested_without_slash_r = gray_suggested.replace(/\r/g, "");
    //         if (gray_suggested_without_slash_r !== this.grey_text_explicitly) {
    //                 let gray_split = this.grey_text_explicitly.split(/\r?\n/);
    //                 for (let i = 0; i < gray_split.length; i++) {
    //                     console.log(["grey_text_explicitly", gray_split[i]]);
    //                 }
    //                 console.log(["WARNING: grey_text_explicitly doesn't match actual edit, will do nothing"]);
    //             return;
    //         }
    //         this.unchanged_percentage = completionMetrics.unchanged_percentage(gray_suggested, gray_edited);
    //         console.log(["unchanged_percentage", this.unchanged_percentage]);
    //         this.grey_text_edited = gray_edited;
    //         let t3 = Date.now();
    //         // Diffs take 2-4ms on a 2000 lines file
    //         // unchanged_percentage() takes 10ms for a few lines
    //         // (on Macbook M1)
    //         //console.log([this.serial_number, "verify_completion_still_present_in_text getText", t1-t0, "ms, diff", t2-t1, "ms", "unchanged_percentage", t3-t2, "ms"]);
    //     } else {
    //         // now becomes invalid, so
    //         this.transmit_as_accepted();
    //     }
    // }


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
        let cursor_character = multiline ? 0 : position.character;
        let this_completion_serial_number = 6000;
        [completion, this_completion_serial_number] = await this.cached_request(
            cancelToken,
            file_name,
            whole_doc,
            position.line,
            cursor_character,
            debounce_if_not_cached,
            multiline,
            called_manually,
        );

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
        console.log([
            "completion", completion,
            "replace_range0", replace_range0.line, replace_range0.character,
            "replace_range1", replace_range1.line, replace_range1.character,
        ]);
        let completionItem = new vscode.InlineCompletionItem(
            completion,
            new vscode.Range(replace_range0, replace_range1),
            command,
        );
        return [completionItem];
    }

    // public cache: Map<string, CacheEntry> = new Map();  // LRUCache?
    // public slowdown_rapidfire_ts = 0;
    // public slowdown_rapidfire_count = 0;
    // public slowdown_sustained_ts = 0;
    // public slowdown_sustained_count = 0;

    // async slowdown(cancelToken: vscode.CancellationToken): Promise<boolean>
    // {
    //     const ALLOWED_RATE_RAPIDFIRE = 2.0;
    //     const ALLOWED_RATE_SUSTAINED = 1.0;  // requests per second
    //     while (1) {
    //         await fetch.wait_until_all_requests_finished();
    //         if (cancelToken.isCancellationRequested) {
    //             return true;
    //         }
    //         let now = Date.now();
    //         let rapid_rate = this.slowdown_rapidfire_count / ((now - this.slowdown_rapidfire_ts) / 1000.0);
    //         let sustained_rate = this.slowdown_sustained_count / ((now - this.slowdown_sustained_ts) / 1000.0);
    //         if (rapid_rate > ALLOWED_RATE_RAPIDFIRE || sustained_rate > ALLOWED_RATE_SUSTAINED) {
    //             // console.log("slowdown, rapid=" + rapid_rate + ", sustained=" + sustained_rate);
    //             let sleep = 100;
    //             await new Promise(resolve => setTimeout(resolve, sleep));
    //         } else {
    //             // console.log("go ahead, rapid=" + rapid_rate + ", sustained=" + sustained_rate);
    //             break;
    //         }
    //     }
    //     let now = Date.now();
    //     if (now - this.slowdown_rapidfire_ts > 500) {
    //         // 2*0.5=1 request in 0.5 seconds -- it's there to prevent a wi-fi lag from forming a pile of requests
    //         this.slowdown_rapidfire_ts = now;
    //         this.slowdown_rapidfire_count = 0;
    //     }
    //     if (now - this.slowdown_sustained_ts > 20000) {
    //         // reset every 20 seconds
    //         this.slowdown_sustained_ts = now;
    //         this.slowdown_sustained_count = 0;
    //     }
    //     this.slowdown_rapidfire_count += 1;
    //     this.slowdown_sustained_count += 1;
    //     return false;
    // }

    async cached_request(
        cancelToken: vscode.CancellationToken,
        file_name: string,
        whole_doc: string,
        cursor_line: number,
        cursor_character: number,
        debounce_if_not_cached: boolean,
        multiline: boolean,
        called_manually: boolean
    ): Promise<[string, number]>
    {
        // if (debounce_if_not_cached) {
        //     let drop = await this.slowdown(cancelToken);
        //     if (drop) { return ["", -1]; }
        // }

        let request = new fetch.PendingRequest(undefined, cancelToken);
        let max_tokens = 50;
        let sources: { [key: string]: string } = {};
        sources[file_name] = whole_doc;

        let t0 = Date.now();
        let promise: any;
        promise = fetch.fetch_code_completion(
            cancelToken,
            sources,
            multiline,
            file_name,
            cursor_line,
            cursor_character,
            max_tokens,
        );
        request.supply_stream(promise, undefined);
        let json: any;
        json = await request.apiPromise;
        if (json === undefined) {
            return ["", -1];
        }
        let t1 = Date.now();
        let ms_int = Math.round(t1 - t0);
        console.log([`API request ${ms_int}ms`]);

        let completion = json["choices"][0]["code_completion"];
        if (completion === undefined || completion === "" || completion === "\n") {
            console.log(["completion is empty", completion]);
            return ["", -1];
        }
        // let de_facto_model = json["model"];
        let serial_number = 7000;
        return [completion, serial_number];
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
    console.log(["inline_accepted", serial_number]);
    // let feed: CompletionApiFieldsWithTimer = _completion_data_feedback_candidate;
    // if (!feed || feed.serial_number !== serial_number) {
    //     console.log(["WRONG SERIAL, accepted", serial_number, "stored", feed.serial_number]);
    //     return;
    // }
    // if (feed.ts_presented === 0) {
    //     return;
    // }
    // let ponder_time_ms = feed.ts_reacted - feed.ts_presented;
    // let req_to_react_ms = feed.ts_reacted - feed.ts_req;
    // console.log(["inline_accepted", serial_number, "ponder_time_ms", ponder_time_ms, "req_to_react_ms", req_to_react_ms]);
    // if (!feed.document) {
    //     console.log(["WARNING: inline_accepted no document"]);
    //     return;
    // }
    // if (feed.on_interval !== undefined) {
    //     console.log(["WARNING: on_interval already set"]);
    //     return;
    // }
    // // User might have pressed Tab on spaces ahead, that just moves the cursor right and reuses the same completion from cache.
    // // So don't return on ts_reacted.
    // feed.ts_reacted = Date.now();
    // feed.results[feed.cursor_file] = feed.document.getText();
    // feed.accepted = true;
    // feed.rejected_reason = "";
    // feed.on_text_edited_disposable = vscode.workspace.onDidChangeTextDocument((ev: vscode.TextDocumentChangeEvent) => {
    //     if (ev.document === feed.document) {
    //         feed.verify_completion_still_present_in_text();
    //     }
    // });
}


export function inline_rejected(reason: string)
{
    console.log(["inline_rejected", reason]);
    // let feed: CompletionApiFieldsWithTimer = _completion_data_feedback_candidate;
    // if (feed.ts_presented === 0) {
    //     return;
    // }
    // if (feed.ts_reacted) {
    //     return;
    // }
    // if (feed.accepted) {
    //     return;
    // }
    // feed.ts_reacted = Date.now();
    // feed.rejected_reason = reason;
    // setTimeout(() => {
    //     feed.transmit_as_rejected();
    // }, 25000);
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

/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
import * as estate from "./estate";
import * as editChaining from "./editChaining";


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
                console.log(["333 no inline", state.get_mode()]);
                return;
            }
        }
        if (!estate.is_lang_enabled(document)) {
            return;
        }
        let whole_doc = document.getText();
        let cursor = document.offsetAt(position);
        let file_name = document.fileName;
        if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
            // sleep 100ms, in a hope request will be cancelled
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        let login: any = await fetch.login();
        if (!login) { return; }
        await fetch.waitAllRequests();
        if (cancelToken.isCancellationRequested) {
            console.log(["444 on inline"]);
            return;
        }

        let sources: { [key: string]: string } = {};
        sources[file_name] = whole_doc;
        let request = new fetch.PendingRequest(undefined, cancelToken);
        let max_tokens = 50;
        let max_edits = 1;
        let current_line = document.lineAt(position.line);
        let left_of_cursor = current_line.text.substring(0, position.character);
        let right_of_cursor = current_line.text.substring(position.character);
        let left_all_spaces = left_of_cursor.replace(/\s/g, "").length === 0;
        let multiline = left_all_spaces;
        let stop_tokens: string[];
        if (multiline) {
            stop_tokens = ["\n\n"];
        } else {
            stop_tokens = ["\n", "\n\n"];
        }
        let eol_pos = new vscode.Position(position.line, current_line.text.length);
        let right_of_cursor_has_only_special_chars = Boolean(right_of_cursor.match(/^[:\s\t\n\r),."'\]]*$/));
        let fail = !right_of_cursor_has_only_special_chars;
        if (!fail && state) {
            fail = state.inline_prefer_edit_chaining;
            state.inline_prefer_edit_chaining = false;
        }
        let stop_at = cursor;
        let modif_doc = whole_doc;
        if (!fail) {
            console.log(["INFILL", left_of_cursor, "|", right_of_cursor]);
            request.supplyStream(fetch.fetchAPI(
                cancelToken,
                sources,
                "Infill", // message
                "infill", // api function
                file_name,
                cursor,
                cursor,
                max_tokens,
                max_edits,
                stop_tokens,
            ));
            let json: any = await request.apiPromise;
            if (json.detail) {
                let detail = json.detail;
                console.log(["ERROR", detail]);
                global.menu.socketError();
                return;
            }
            modif_doc = json["choices"][0]["files"][file_name];
            let before_cursor1 = whole_doc.substring(0, cursor);
            let before_cursor2 = modif_doc.substring(0, cursor);
            if (before_cursor1 !== before_cursor2) {
                console.log("before_cursor1 != before_cursor2");
                return;
            }
            stop_at = 0;
            let any_different = false;
            for (let i = -1; i > -whole_doc.length; i--) {
                let char1 = whole_doc.slice(i, i + 1);
                let char2 = modif_doc.slice(i, i + 1);
                // console.log("i", i, "char1", char1, "char2", char2);
                if (char1 === "\n") {
                    stop_at = i + 1;
                }
                if (char1 !== char2) {
                    //stop_at = i + 1;
                    any_different = true;
                    break;
                }
            }
            // fail = stop_at === 0;
            fail = !any_different;
        }
        let completion = "";
        if (!fail) {
            completion = modif_doc.substring(cursor, modif_doc.length + stop_at);
            console.log(["SUCCESS", request.seq, completion]);
        }
        if (!fail && !multiline) {
            completion = completion.replace(/\s+$/, "");
            console.log(["RTRIM", request.seq, completion]);
            fail = completion.match(/\n/g) !== null;
        }
        if (!fail) {
            fail = completion.length === 0;
        }
        // completion === whole_doc.substring(cursor)
        // console.log(["fail", fail]);
        // let end_of_line = new vscode.Position(position.line, current_line.text.length);
        let chain = false;
        if (fail || completion === right_of_cursor) {
            let summary = await editChaining.runEditChaining(false);
            if (!summary) {
                return;
            }
            completion = right_of_cursor + "\n" + summary;
            // multiline = true;
            chain = true;
        }
        let completion_length = completion.length;
        let index_of_slash_n = completion.indexOf("\n");
        if (index_of_slash_n !== -1) {
            completion_length = index_of_slash_n;
        }
        let completionItem = new vscode.InlineCompletionItem(
            completion,
            // new vscode.Range(position, position.translate(0, completion_length))
            // new vscode.Range(position, position),
            new vscode.Range(position, eol_pos),
            // new vscode.Range(position, eol_pos.translate(0, 1))
               //.translate(0, completion_length))
        );
        // if (!multiline) {
            // completionItem.filterText = completion + right_of_cursor;
        // } else {
            // completionItem.filterText = completion;
        // }
        if (chain) {
            completionItem.command = {
                title: "hello world",
                command: "plugin-vscode.inlineAccepted",
                arguments: [document, position]
            };
        }
        return [completionItem];
    }
}

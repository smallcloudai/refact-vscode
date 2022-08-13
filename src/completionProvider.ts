/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
import * as storeVersions from './storeVersions';


export class MyInlineCompletionProvider implements vscode.InlineCompletionItemProvider
{
    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        cancelToken: vscode.CancellationToken
    )
    {
        let whole_doc = document.getText();
        let cursor = document.offsetAt(position);
        let file_name = document.fileName;
        if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
            // sleep 100ms, in a hope request will be cancelled
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        await fetch.waitAllRequests();
        if (cancelToken.isCancellationRequested) {
            return;
        }

        let sources: { [key: string]: string } = {};
        sources[file_name] = whole_doc;
        let request = new fetch.PendingRequest(undefined, cancelToken);
        let max_tokens = 50;
        let max_edits = 1;
        let stop_tokens: string[] = ["\n", "\n\n"];
        let current_line = document.lineAt(position.line);
        let left_of_cursor = current_line.text.substring(0, position.character);
        let right_of_cursor = current_line.text.substring(position.character);
        let right_of_cursor_has_only_special_chars = right_of_cursor.match(/^[\s\t\n\r)"'\]]*$/);
        if (right_of_cursor_has_only_special_chars) {
            console.log(["INFILL", left_of_cursor, "|", right_of_cursor]);
            request.supplyStream(fetch.fetchAPI(
                cancelToken,
                sources,
                "Infill",
                // "diff-atcursor",
                "infill",
                file_name,
                cursor,
                cursor,
                max_tokens,
                max_edits,
                stop_tokens,
            ));
        } else {
            let more_revisions: { [key: string]: string } = storeVersions.fnGetRevisions(file_name);
            let send_revisions: { [key: string]: string } = {};
            let explain = "";
            for (let key in more_revisions) {
                if (whole_doc === more_revisions[key]) {
                    explain += key + " (the same) ";
                    continue;
                }
                explain += key + " ";
                send_revisions[key] = more_revisions[key];
            }
            let stop_tokens: string[] = [];
            send_revisions[file_name] = whole_doc;
            console.log(["edit chain", explain]);
            request.supplyStream(fetch.fetchAPI(
                cancelToken,
                send_revisions,
                "Fix",
                "edit-chain",
                file_name,
                cursor,
                cursor,
                max_tokens,
                max_edits,
                stop_tokens,
            ));
        }
        let json: any = await request.apiPromise;
        if (json.detail) {
            let detail = json.detail;
            console.log(["ERROR", detail]);
            return;
        }
        let modif_doc = json["choices"][0]["files"][file_name];
        let before_cursor1 = whole_doc.substring(0, cursor);
        let before_cursor2 = modif_doc.substring(0, cursor);
        if (before_cursor1 !== before_cursor2) {
            console.log("before_cursor1 != before_cursor2");
            return { items: [] };
        }
        let stop_at = 0;
        for (let i = -1; i > -whole_doc.length; i--) {
            let char1 = whole_doc.slice(i, i + 1);
            let char2 = modif_doc.slice(i, i + 1);
            // console.log("i", i, "char1", char1, "char2", char2);
            if (char1 !== char2) {
                stop_at = i + 1;
                break;
            }
        }
        if (stop_at === 0) {
            console.log("stop_at == 0");
            return { items: [] };
        }
        // console.log("modif_doc == ", modif_doc);
        // console.log("cursor", cursor, "stop_at", stop_at, "modif_doc.length", modif_doc.length);

        let completion = modif_doc.substring(cursor, modif_doc.length + stop_at + 1);
        console.log(["SUCCESS", request.seq, completion]);

        let completionItem = new vscode.InlineCompletionItem(
            completion,
            new vscode.Range(position, position.translate(0, 1))
        );
        completionItem.filterText = completion;
        // completionItem.command = {
        //     title: "hello world2",
        //     command: "plugin-vscode.inlineAccepted",
        //     arguments: [completionItem]
        // };
        return [completionItem];
    }
}


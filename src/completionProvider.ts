/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";



export class MyInlineCompletionProvider implements vscode.InlineCompletionItemProvider
{
    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        cancelToken: vscode.CancellationToken
    )
    {
        console.log(["provideInlineCompletionItems", position.line, position.character, context.triggerKind]);
        // if (cancelToken) {
            // let abort = new fetchH2.AbortController();
            // cancelToken.onCancellationRequested(() => {
            //     console.log(["User canceled inline completion"]);
            // });
            // init.signal = abort.signal;
        // }
        let whole_doc = document.getText();
        let cursor = document.offsetAt(position);
        let file_name = document.fileName;
        // sleep 100ms, in a hope request will be cancelled
        await new Promise(resolve => setTimeout(resolve, 100));
        fetch.waitAllRequests();
        if (cancelToken.isCancellationRequested) {
            return;
        }

        let sources: { [key: string]: string } = {};
        sources[file_name] = whole_doc;
        let max_tokens = 50;
        let max_edits = 1;
        let request = new fetch.PendingRequest(undefined, cancelToken);
        request.supplyStream(fetch.fetchAPI(
            sources,
            "Infill",
            // "diff-atcursor",
            "infill",
            file_name,
            cursor,
            cursor,
            max_tokens,
            max_edits,
        ));

        let json: any = await request.apiPromise;
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
            new vscode.Range(position, position.translate(0, completion.length))
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


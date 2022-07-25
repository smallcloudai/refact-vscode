/* eslint-disable @typescript-eslint/naming-convention */
import {
    CancellationToken,
    Position,
    TextDocument,
    InlineCompletionContext,
    InlineCompletionItemProvider,
    InlineCompletionItem,
    InlineCompletionList,
    ProviderResult,
    Range,
    Command,
    window,
    InlineCompletionTriggerKind,
    commands
} from "vscode";
// import {getCompletions} from "../utils/network";
import {fetchAPI} from "./fetchAPI";


export class MyInlineCompletionProvider implements InlineCompletionItemProvider
{
    async provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken
    )
    {
        console.log("provideInlineCompletionItems", position, context.triggerKind);
        if (token.isCancellationRequested) {
            console.log("isCancellationRequested");
            return { items: [] };
        }
        let whole_doc = document.getText();
        // const startLine = position.line > maxLines ? position.line - maxLines : 0;
        // const textBefore = document.getText(
        //     new Range(position.with(startLine, 0), position.with(undefined, 0))
        // );
        // const endLine = document.lineCount > maxLines ? maxLines : document.lineCount - 1;
        // const lastLine = document.lineAt(endLine);
        // const textAfter = document.getText(new Range(position, lastLine.range.end));
        // const currentLine = document.getText(new Range(position.with(undefined, 0), position));
        // console.log("len of text before", textBefore.length);
        // console.log("len of text after", textAfter.length);
        // console.log("current line", currentLine);
        let cursor = document.offsetAt(position);
        let file_name = document.fileName;
        let sources: { [key: string]: string } = {};
        sources[file_name] = whole_doc;
        let max_tokens = 50;
        let promise = fetchAPI(
            sources,
            "Fix",
            "infill",
            file_name,
            cursor,
            cursor,
            max_tokens,
            1
        );

        let json;
        try {
            const result = await promise;
            json = await result.json();
        } catch (err: unknown) {
            if (err instanceof Error) {
                console.log(err.message);
            }
            return { items: [] };
        }

        console.log(json);
        let modif_doc = json["choices"][0]["files"][file_name];
        let before_cursor1 = whole_doc.substring(0, cursor);
        let before_cursor2 = modif_doc.substring(0, cursor);
        if (before_cursor1 !== before_cursor2) {
            console.log("before_cursor1 != before_cursor2");
            return { items: [] };
        }
        // let after_cursor1 = whole_doc.substring(cursor);
        // let after_cursor2 = modif_doc.substring(cursor);
        let stop_at = 0;
        for (let i = -1; i > -whole_doc.length; i--) {
            let char1 = whole_doc.slice(i, i + 1);
            let char2 = modif_doc.slice(i, i + 1);
            console.log("i", i, "char1", char1, "char2", char2);

            if (char1 !== char2) {
                stop_at = i;
                break;
            }
        }
        if (stop_at === 0) {
            console.log("stop_at == 0");
            return { items: [] };
        }
        console.log("modif_doc == ", modif_doc);
        console.log("cursor", cursor, "stop_at", stop_at, "modif_doc.length", modif_doc.length);

        let completion = modif_doc.substring(cursor, modif_doc.length + stop_at + 1);
        console.log("completion == ", completion);

        let completionItem = new InlineCompletionItem(
            completion,
            new Range(position, position.translate(0, completion.length))
        );
        completionItem.filterText = completion;
        completionItem.command = {
            title: "hello world2",
            command: "plugin-vscode.inlineAccepted",
            arguments: [completionItem]
        };

        return [completionItem];
    }
}

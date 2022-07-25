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


const maxLines = 1000; // TODO move to settings


export class MyInlineCompletionProvider implements InlineCompletionItemProvider
{
    async provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken
    )
    {
        console.log(position, context.triggerKind);
        if (token.isCancellationRequested) {
            console.log("isCancellationRequested");
            return { items: [] };
        }
        const startLine = position.line > maxLines ? position.line - maxLines : 0;
        const textBefore = document.getText(
            new Range(position.with(startLine, 0), position.with(undefined, 0))
        );
        const endLine = document.lineCount > maxLines ? maxLines : document.lineCount - 1;
        const lastLine = document.lineAt(endLine);
        const textAfter = document.getText(new Range(position, lastLine.range.end));
        const currentLine = document.getText(new Range(position.with(undefined, 0), position));
        console.log("len of text before", textBefore.length);
        console.log("len of text after", textAfter.length);
        console.log("current line", currentLine);

        // await new Promise(resolve => setTimeout(resolve, 1000));

        let completionItem = new InlineCompletionItem(
            "hello world2",
            new Range(position, position.translate(0, "hello world2".length))
        );
        completionItem.filterText = "hello world2";
        completionItem.command = {
            title: "hello world2",
            command: "plugin-vscode.inlineAccepted",
            arguments: [completionItem]
        };
		let promise = fetchAPI(
			{ "hello.py": textBefore + currentLine + textAfter },
			"Fix",
			"infill",
			"hello.py",
			position.character,
			position.character,
			50
		);
        try {
			const result = await promise;
			const json = await result.json();
			console.log(json);
		} catch (err: unknown) {
            if (err instanceof Error) {
				console.log(err.message);
			}
            return { items: [] };
		}
		return [completionItem];
	}
}

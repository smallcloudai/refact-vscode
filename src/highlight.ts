/* eslint-disable @typescript-eslint/naming-convention */
import {
    Position,
    TextDocument,
    TextEditor,
    Range,
    Command,
    window,
    languages,
    commands,
    workspace,
    DecorationOptions,
    OverviewRulerLane,
    TextEditorDecorationType,
    DiagnosticCollection,
} from "vscode";

import {fetchAPI} from "./fetchAPI";

export async function getHighlight() {
    
    let activeEditor = window.activeTextEditor;
    let document = activeEditor!.document;
    let curPos = activeEditor!.selection.active;
    let cursor = document.offsetAt(curPos);

    console.log('cursor position', cursor);

    let file_name = document.fileName;
    let sources: { [key: string]: string } = {};
    let whole_doc = document.getText();
    sources[file_name] = whole_doc;
    let max_tokens = 0;

    let promise = fetchAPI(
        sources,
        "Fix",
        "highlight",
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

    const decoration = window.createTextEditorDecorationType({
            backgroundColor: 'yellow',
    });
    
    for (let index = 0; index < json.highlight.length; index++) {
        let decorationsArray: DecorationOptions[] = [];
        const element = json.highlight[index];
        const start = document.positionAt(element[0]);
        const end = document.positionAt(element[1]);
        let range = new Range(
            start,
            end
        );

        let decoration = { range };

        decorationsArray.push(decoration);

        const decorationType = window.createTextEditorDecorationType({
            backgroundColor: 'yellow',
            opacity: element[2]
        });
        
        activeEditor?.setDecorations(decorationType, decorationsArray);
        workspace.onDidChangeTextDocument(()=> {
            decorationType.dispose();
        });
        let command = commands.registerCommand('plugin-vscode.esc', () => {
            decorationType.dispose();
            command.dispose();
        });
    }
}

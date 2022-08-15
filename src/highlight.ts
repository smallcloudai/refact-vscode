/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
import * as interactiveDiff from "./interactiveDiff";
import { Mode } from "./interactiveDiff";


// let highlightJson: any = [];
// let highlights: any = [];

let cursor_move_event: any = [];
export let global_intent = "Fix";


export async function runHighlight(editor: vscode.TextEditor, intent: string | undefined)
{
    if (intent === undefined) {
        intent = global_intent;
    } else {
        global_intent = intent;
    }
    let state = interactiveDiff.getStateOfEditor(editor);
    let doc = editor.document;
    let cursor = doc.offsetAt(editor.selection.active);
    let file_name = doc.fileName;
    let sources: { [key: string]: string } = {};
    let whole_doc = doc.getText();
    state.originalCode = whole_doc;
    sources[file_name] = whole_doc;
    let max_tokens = 0;
    let cancellationTokenSource = new vscode.CancellationTokenSource();
    let cancelToken = cancellationTokenSource.token;
    await fetch.waitAllRequests();
    let request = new fetch.PendingRequest(undefined, cancelToken);
    let stop_tokens: string[] = [];
    request.supplyStream(fetch.fetchAPI(
        cancelToken,
        sources,
        intent,
        "highlight",
        file_name,
        cursor,
        cursor,
        max_tokens,
        1,
        stop_tokens,
    ));
    let json: any = await request.apiPromise;
    if (json.detail) {
        let detail = json.detail;
        console.log(["ERROR", detail]);
        return;
    }
    state.mode = Mode.Highlight;
    state.highlight_json_backup = json;
    showHighlight(editor, json);
}

export function showHighlight(editor: vscode.TextEditor, json: any)
{
    let state = interactiveDiff.getStateOfEditor(editor);
    let doc = editor.document;
    for (let index = 0; index < json.highlight.length; index++) {
        const element = json.highlight[index];
        const start = doc.positionAt(element[0]);
        const end = doc.positionAt(element[1]);
        let range = new vscode.Range(start, end);
        let decorange = { range };
        let range_list: any = [];
        range_list.push(decorange);
        state.sensitive_ranges.push(decorange);
        let deco_type = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 240, 0, ' + element[2] + ')',
            color: 'black'
        });
        state.highlights.push(deco_type);
        editor.setDecorations(deco_type, range_list);
    }
    cursor_move_event = vscode.window.onDidChangeTextEditorSelection((ev: vscode.TextEditorSelectionChangeEvent) => {
        let ev_editor = ev.textEditor;
        if (!editor || editor !== ev_editor) {
            return;
        }
        let cPos = editor.selection.active;
        let cursor = doc.offsetAt(cPos);
        for (let index = 0; index < state.sensitive_ranges.length; index++) {
            const element = state.sensitive_ranges[index];
            if (element.range.contains(cPos)) {
                queryDiff(editor, cursor);
            }
        }
    });
    vscode.commands.executeCommand('setContext', 'codify.runEsc', true);
    console.log(["ESC ON HL"]);
}

export async function queryDiff(editor: vscode.TextEditor, cursor: number)
{
    let state = interactiveDiff.getStateOfEditor(editor);
    let doc = editor.document;
    let file_name = doc.fileName;
    let sources: { [key: string]: string } = {};
    let whole_doc = doc.getText();
    sources[file_name] = whole_doc;
    let max_tokens = 150;
    let cancellationTokenSource = new vscode.CancellationTokenSource();
    let cancelToken = cancellationTokenSource.token;
    await fetch.waitAllRequests();
    let request = new fetch.PendingRequest(undefined, cancelToken);
    let stop_tokens: string[] = [];
    request.supplyStream(fetch.fetchAPI(
        cancelToken,
        sources,
        global_intent,
        "diff-atcursor",
        file_name,
        cursor,
        cursor,
        max_tokens,
        1,
        stop_tokens,
    ));
    let json: any = await request.apiPromise;
    if (json.detail) {
        let detail = json.detail;
        console.log(["ERROR", detail]);
        return;
    }
    if (state.mode === Mode.Highlight) {
        let modif_doc = json["choices"][0]["files"][file_name];
        interactiveDiff.offerDiff(editor, modif_doc);
    }
}

export function clearHighlight(editor: vscode.TextEditor)
{
    let state = interactiveDiff.getStateOfEditor(editor);
    for (let index = 0; index < state.highlights.length; index++) {
        const element = state.highlights[index];
        editor.setDecorations(element, []);
    }
    state.highlights.length = 0;
    state.sensitive_ranges.length = 0;
    cursor_move_event.dispose();
}


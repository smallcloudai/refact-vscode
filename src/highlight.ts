/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
import * as interactiveDiff from "./interactiveDiff";
import { Mode } from "./estate";
import * as estate from "./estate";


let cursor_move_event: any = undefined;
let text_edited_event: any = undefined;
export let global_intent = "Fix";


export function saveIntent(intent: string)
{
    if (global_intent !== intent) {
        global_intent = intent;
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            let state = estate.state_of_editor(editor);
            state.area2cache.clear();
        }
    }
}


export async function runHighlight(editor: vscode.TextEditor, intent: string | undefined)
{
    let state = estate.state_of_editor(editor);
    if (intent === undefined) {
        intent = global_intent;
    } else {
        saveIntent(intent);
    }
    if (state.mode === Mode.Highlight) {
        clearHighlight(editor);
    } else if (state.mode === Mode.Diff || state.mode === Mode.DiffWait) {
        await interactiveDiff.rollback(editor);
    }
    interactiveDiff.handsOff(editor);
    let doc = editor.document;
    let cursor = doc.offsetAt(editor.selection.active);
    let file_name = doc.fileName;
    let sources: { [key: string]: string } = {};
    let whole_doc = doc.getText();
    sources[file_name] = whole_doc;
    let max_tokens = 0;
    let cancellationTokenSource = new vscode.CancellationTokenSource();
    let cancelToken = cancellationTokenSource.token;
    await fetch.waitAllRequests();
    let request = new fetch.PendingRequest(undefined, cancelToken);
    let stop_tokens: string[] = [];
    global.menu.statusbarLoading(true);
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
    global.menu.statusbarError(false);
    if(json) { global.menu.statusbarLoading(false); }
    if (json.detail) {
        let detail = json.detail;
        console.log(["ERROR", detail]);
        global.menu.statusbarError(true);
        return;
    }
    state.mode = Mode.Highlight;
    state.highlight_json_backup = json;
    showHighlight(editor, json);
}

export function showHighlight(editor: vscode.TextEditor, json: any)
{
    let state = estate.state_of_editor(editor);
    let doc = editor.document;
    for (let index = 0; index < json.highlight.length; index++) {
        const element = json.highlight[index];
        const start = doc.positionAt(element[0]);
        const end = doc.positionAt(element[1]);
        let range = new vscode.Range(start, end);
        let decorange = { range };
        let range_list: vscode.DecorationOptions[] = [];
        range_list.push(decorange);
        // state.sensitive_ranges.push(decorange);
        let deco_type = vscode.window.createTextEditorDecorationType({
            overviewRulerLane: vscode.OverviewRulerLane.Full,
            overviewRulerColor: 'rgba(255, 255, 0, ' + element[2] + ')',
            backgroundColor: 'rgba(255, 255, 0, ' + element[2] + ')',
            color: 'black'
        });
        // console.log(["opacity", element[2], "text", doc.getText(range)]);
        state.highlights.push(deco_type);
        editor.setDecorations(deco_type, range_list);
    }
    for (let index = 0; index < json.highlight16.length; index++) {
        const element = json.highlight16[index];
        const start = doc.positionAt(element[0]);
        const end = doc.positionAt(element[1]);
        let range = new vscode.Range(start, end);
        let decorange = { range };
        let range_list: vscode.DecorationOptions[] = [];
        range_list.push(decorange);
        state.sensitive_ranges.push(decorange);
        let deco_type = vscode.window.createTextEditorDecorationType({
            overviewRulerLane: vscode.OverviewRulerLane.Full,
            overviewRulerColor: 'rgba(255, 255, 0, ' + element[2] + ')',
            backgroundColor: 'rgba(255, 255, 0, ' + element[2] + ')',
            // color: 'black'
        });
        // console.log(["opacity", element[2], "16text", doc.getText(range)]);
        state.highlights.push(deco_type);
        editor.setDecorations(deco_type, range_list);
    }
    _forgetEvents();
    setupKeyboardReactions(editor);
    vscode.commands.executeCommand('setContext', 'codify.runEsc', true);
    console.log(["ESC ON HL"]);
}


export function setupKeyboardReactions(editor: vscode.TextEditor)
{
    cursor_move_event = vscode.window.onDidChangeTextEditorSelection((ev: vscode.TextEditorSelectionChangeEvent) => {
        let ev_editor = ev.textEditor;
        if (!editor || editor !== ev_editor) {
            return;
        }
        let pos1 = editor.selection.active;
        let pos2 = editor.selection.anchor;
        if (pos1.line === pos2.line && pos1.character === pos2.character) {
            onCursorMoved(editor, pos1);
        }
    });
    text_edited_event = vscode.workspace.onDidChangeTextDocument((ev: vscode.TextDocumentChangeEvent) => {
    // window.onDidChangeTextDocument((ev: vscode.TextDocumentChangeEvent) => {
        let doc = ev.document;
        let ev_doc = editor.document;
        if (doc !== ev_doc) {
            return;
        }
        onTextEdited(editor);
    });
}


export function onCursorMoved(editor: vscode.TextEditor, pos: vscode.Position)
{
    console.log(["cursor moved", pos.line, pos.character]);
    let state = estate.state_of_editor(editor);
    for (let i = 0; i < state.sensitive_ranges.length; i++) {
        const element = state.sensitive_ranges[i];
        if (element.range.contains(pos)) {
            interactiveDiff.queryDiff(editor, element.range, "diff-atcursor");
        }
    }
    let selection = editor.selection;
    let is_empty = selection.anchor === selection.active;
    if (!is_empty && state.mode === Mode.DiffChangingDoc) {
        interactiveDiff.handsOff(editor);
    }
}


export function onTextEdited(editor: vscode.TextEditor)
{
    let state = estate.state_of_editor(editor);
    if (state.mode === Mode.Diff || state.mode === Mode.DiffWait) {
        console.log(["text edited mode", state.mode, "hands off"]);
        interactiveDiff.handsOff(editor);
        state.highlight_json_backup = undefined;
        state.area2cache.clear();
        state.mode = Mode.Normal;
    } else if (state.mode === Mode.Highlight) {
        clearHighlight(editor);
        state.area2cache.clear();
        state.highlight_json_backup = undefined;
        state.mode = Mode.Normal;
    } else if (state.mode === Mode.Normal) {
        state.area2cache.clear();
        state.highlight_json_backup = undefined;
    } else {
        console.log(["text edited mode", state.mode, "do nothing"]);
    }
}


export function clearHighlight(editor: vscode.TextEditor)
{
    let state = estate.state_of_editor(editor);
    for (let index = 0; index < state.highlights.length; index++) {
        const element = state.highlights[index];
        element.dispose();
    }
    state.highlights.length = 0;
    state.sensitive_ranges.length = 0;
}


function _forgetEvents()
{
    if (cursor_move_event !== undefined) {
        cursor_move_event.dispose();
        cursor_move_event = undefined;
    }
    if (text_edited_event !== undefined) {
        text_edited_event.dispose();
        text_edited_event = undefined;
    }
}


export function backToNormal(editor: vscode.TextEditor)
{
    let state = estate.state_of_editor(editor);
    state.mode = Mode.Normal;
    state.highlight_json_backup = undefined;
    _forgetEvents();
    clearHighlight(editor);
}

/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
import * as storeVersions from './storeVersions';
import * as highlight from "./highlight";
import * as interactiveDiff from "./interactiveDiff";


export async function cleanupEditChaining(editor: vscode.TextEditor)
{
    let state = interactiveDiff.getStateOfEditor(editor);
    state.edit_chain_modif_doc = undefined;
}


export async function runEditChaining(animation: boolean): Promise<String>
{
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
        return "";
    }
    let state = interactiveDiff.getStateOfEditor(editor);
    if (state.mode !== interactiveDiff.Mode.Normal && state.mode !== interactiveDiff.Mode.Highlight) {
        return "";
    }
    let doc = editor.document;
    let position: vscode.Position = editor.selection.active;
    let line_n = position.line;
    let cursor = doc.offsetAt(position);
    let file_name = doc.fileName;

    let cancellationTokenSource = new vscode.CancellationTokenSource();
    let cancelToken = cancellationTokenSource.token;
    let request = new fetch.PendingRequest(undefined, cancelToken);

    fetch.cancelAllRequests();
    // if (state.mode === interactiveDiff.Mode.DiffWait) {
    //     state.mode = interactiveDiff.Mode.Normal;
    // }
    request.cancellationTokenSource = cancellationTokenSource;
    await fetch.waitAllRequests();
    if (cancelToken.isCancellationRequested) {
        return "";
    }

    let sources: { [key: string]: string } = {};
    let whole_doc = doc.getText();
    sources[file_name] = whole_doc;
    let max_tokens = 50;
    let max_edits = 1;
    // let current_line = document.lineAt(position.line);
    // let left_of_cursor = current_line.text.substring(0, position.character);
    // let right_of_cursor = current_line.text.substring(position.character);
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
    // test if empty
    if (explain.length === 0) {
        return "";
    }
    let stop_tokens: string[] = [];
    send_revisions[file_name] = whole_doc;
    console.log(["edit chain", explain]);
    state.mode = interactiveDiff.Mode.DiffWait;
    let sensitive_area = new vscode.Range(new vscode.Position(line_n, 0), new vscode.Position(line_n, 0));
    if (animation) {
        interactiveDiff.animationStart(editor, sensitive_area);
    }
    request.supplyStream(fetch.fetchAPI(
        cancelToken,
        send_revisions,
        highlight.global_intent,
        "edit-chain",
        file_name,
        cursor,
        cursor,
        max_tokens,
        max_edits,
        stop_tokens,
    ));
    if ((state.mode === interactiveDiff.Mode.DiffWait) && !cancelToken.isCancellationRequested) {
        state.mode = interactiveDiff.Mode.Normal;
    }
    let json: any = await request.apiPromise;
    if (json.detail) {
        let detail = json.detail;
        console.log(["ERROR", detail]);
        return "";
    }
    state.showing_diff_edit_chain = sensitive_area;
    state.edit_chain_modif_doc = json["choices"][0]["files"][file_name];
    return "hello world";
}

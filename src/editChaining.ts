/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
import * as storeVersions from './storeVersions';
import * as highlight from "./highlight";
import * as interactiveDiff from "./interactiveDiff";
const Diff = require('diff');  // Documentation: https://github.com/kpdecker/jsdiff/


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
    let recent_but_different = "";
    for (let key in more_revisions) {
        if (whole_doc === more_revisions[key]) {
            explain += key + " (the same) ";
            continue;
        }
        explain += key + " ";
        recent_but_different = key;
        // send_revisions[key] = more_revisions[key];
    }
    if (!recent_but_different) {
        return "";
    }
    send_revisions[recent_but_different] = more_revisions[recent_but_different];
    send_revisions[file_name] = whole_doc;
    let stop_tokens: string[] = [];
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
    if (state.edit_chain_modif_doc) {
        let summary = generateDiffSummary(line_n, whole_doc, state.edit_chain_modif_doc);
        console.log(["CHAIN summary", summary]);
        return summary;
    } else {
        return "";
    }
}

function generateDiffSummary(current_line: number, whole_doc: string, modif_doc: string): string
{
    if (whole_doc === modif_doc) {
        return "";
    }
    const diff = Diff.diffLines(whole_doc, modif_doc);
    let count_added = 0;
    let count_removed = 0;
    let first_line = -1;
    let first_chars = "";
    let prefer_added = true;
    let line_n = 0;
    diff.forEach((part: any) => {
        let span = part.value;
        if (part.added) {
            count_added += span.split("\n").length - 1;
            if (first_line === -1 || prefer_added) {
                prefer_added = false;
                if (first_line === -1) {
                    first_line = line_n;
                }
                first_chars = span;
            }
        } else if (part.removed) {
            count_removed += span.split("\n").length - 1;
            if (first_line === -1) {
                first_line = line_n;
                first_chars = span;
            }
            line_n += span.split("\n").length - 1;
        } else {
            line_n += span.split("\n").length - 1;
        }
    });
    let tmp = first_chars.trim();
    let slash_n = tmp.indexOf("\n");
    if (slash_n !== -1) {
        tmp = tmp.substring(0, slash_n);
    }
    first_chars = tmp.substring(0, 50);
    if (tmp.length > 50) {
        first_chars += "…";
    }
    let result = "";
    if (first_line <= current_line) {
        result = "↑↑ line " + (first_line + 1).toString() + "   ";
    } else {
        result = "↓↓ line " + (first_line + 1).toString() + "   ";
    }
    for (let c=0; c<count_removed; c++) {
        result += "-";
    }
    for (let c=0; c<count_added; c++) {
        result += "+";
    }
    result += "   " + first_chars;
    return result;
}

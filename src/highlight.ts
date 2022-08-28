/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
import * as interactiveDiff from "./interactiveDiff";
import { Mode } from "./estate";
import * as estate from "./estate";



export async function runHighlight(editor: vscode.TextEditor, intent: string | undefined)
{
    let state = estate.state_of_editor(editor);
    if (intent === undefined) {
        intent = estate.global_intent;
    } else {
        estate.saveIntent(intent);
    }
    let doc = editor.document;
    let cursor = doc.offsetAt(editor.selection.active);
    let fn = doc.fileName;
    let sources: { [key: string]: string } = {};
    let whole_doc = doc.getText();
    sources[fn] = whole_doc;
    let cancellationTokenSource = new vscode.CancellationTokenSource();
    let cancelToken = cancellationTokenSource.token;
    await fetch.waitAllRequests();
    let request = new fetch.PendingRequest(undefined, cancelToken);
    let stop_tokens: string[] = [];
    global.menu.statusbarLoading(true);
    let max_tokens = 0;
    request.supplyStream(fetch.fetchAPI(
        cancelToken,
        sources,
        intent,
        "highlight",
        fn,
        cursor,
        cursor,
        max_tokens,
        1,
        stop_tokens,
    ));
    let json: any = await request.apiPromise;
    global.menu.statusbarError(false);
    if (json) {
        global.menu.statusbarLoading(false);
    }
    if (json.detail) {
        let detail = json.detail;
        console.log(["ERROR", detail]);
        global.menu.statusbarError(true);
        return;
    }
    state.highlight_json_backup = json;
    estate.switch_mode(state, Mode.Highlight);
}

export function showHighlight(editor: vscode.TextEditor, json: any)
{
    if (json.highlight === undefined) {
        return;
    }
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


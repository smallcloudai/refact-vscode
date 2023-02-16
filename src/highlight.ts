/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchAPI from "./fetchAPI";
import * as userLogin from "./userLogin";
import { Mode } from "./estate";
import * as estate from "./estate";
import * as crlf from "./crlf";



export async function query_highlight(editor: vscode.TextEditor, intent: string | undefined)
{
    let state = estate.state_of_editor(editor, "query_highlight");
    if (!state) {
        return;
    }
    if (intent === undefined) {
        intent = estate.global_intent;
    } else {
        estate.save_intent(intent);  // need it to return to previous selection
    }
    let doc = editor.document;
    let whole_doc = doc.getText();
    let cursor = doc.offsetAt(editor.selection.active);
    let cursors: number[];
    [whole_doc, cursors] = crlf.cleanup_cr_lf(whole_doc, [cursor]);
    cursor = cursors[0];
    let fn = doc.fileName;
    let sources: { [key: string]: string } = {};
    sources[fn] = whole_doc;
    let cancellationTokenSource = new vscode.CancellationTokenSource();
    let cancelToken = cancellationTokenSource.token;
    let login = await userLogin.inference_login();
    if (!login) { return; }
    await fetchAPI.wait_until_all_requests_finished();
    let request = new fetchAPI.PendingRequest(undefined, cancelToken);
    let stop_tokens: string[] = [];
    global.status_bar.statusbarLoading(true);
    let max_tokens = 0;
    let stream = false;
    request.supply_stream(...fetchAPI.fetch_api_promise(
        cancelToken,
        "highlight",     // scope
        sources,
        intent,
        "highlight",     // scratchpad function
        fn,
        cursor,
        cursor,
        max_tokens,
        1,
        stop_tokens,
        stream,
    ));
    hl_animation_start(editor, editor.selection);
    let json: any;
    json = await request.apiPromise;
    if (json === undefined) {
        return;
    }
    state.highlight_json_backup = json;
    estate.switch_mode(state, Mode.Highlight);
}

export function hl_show(editor: vscode.TextEditor, json: any)
{
    if (json.highlight_tokens === undefined) {
        return;
    }
    let state = estate.state_of_editor(editor, "hl_show");
    if (!state) {
        return;
    }
    let doc = editor.document;
    let highlight_tokens: number[] = [];
    for (let index = 0; index < json.highlight_tokens.length; index++) {
        const element = json.highlight_tokens[index];
        highlight_tokens.push(element[0]);
        highlight_tokens.push(element[1]);
    }
    let highlight_lines: number[] = [];
    for (let index = 0; index < json.highlight_lines.length; index++) {
        const element = json.highlight_lines[index];
        highlight_lines.push(element[0]);
        highlight_lines.push(element[1]);
    }
    let whole_doc = doc.getText();
    highlight_tokens = crlf.add_back_cr_lf(whole_doc, highlight_tokens);
    highlight_lines = crlf.add_back_cr_lf(whole_doc, highlight_lines);
    for (let i=0; i<highlight_tokens.length; i+=2) {
        let start = doc.positionAt(highlight_tokens[i]);
        let end = doc.positionAt(highlight_tokens[i+1]);
        let range = new vscode.Range(start, end);
        let decorange = { range };
        let range_list: vscode.DecorationOptions[] = [];
        range_list.push(decorange);
        // state.sensitive_ranges.push(decorange);
        let deco_type = vscode.window.createTextEditorDecorationType({
            overviewRulerLane: vscode.OverviewRulerLane.Full,
            overviewRulerColor: 'rgba(255, 255, 0, ' + json.highlight_tokens[i/2][2] + ')',
            backgroundColor: 'rgba(255, 255, 0, ' + json.highlight_tokens[i/2][2] + ')',
            color: 'black'
        });
        // console.log(["opacity", element[2], "text", doc.getText(range)]);
        state.highlights.push(deco_type);
        editor.setDecorations(deco_type, range_list);
    }
    for (let i=0; i<highlight_lines.length; i+=2) {
        let start = doc.positionAt(highlight_lines[i]);
        let end = doc.positionAt(highlight_lines[i+1]);
        let range = new vscode.Range(start, end);
        let decorange = { range };
        let range_list: vscode.DecorationOptions[] = [];
        range_list.push(decorange);
        state.sensitive_ranges.push(decorange);
        let deco_type = vscode.window.createTextEditorDecorationType({
            overviewRulerLane: vscode.OverviewRulerLane.Full,
            overviewRulerColor: 'rgba(255, 255, 0, ' + json.highlight_lines[i/2][2] + ')',
            backgroundColor: 'rgba(255, 255, 0, ' + json.highlight_lines[i/2][2] + ')',
            isWholeLine: true,
        });
        // console.log(["opacity", element[2], "16text", doc.getText(range)]);
        state.highlights.push(deco_type);
        editor.setDecorations(deco_type, range_list);
    }
}


export function hl_clear(editor: vscode.TextEditor)
{
    let state = estate.state_of_editor(editor, "hl_clear");
    if (!state) {
        return;
    }
    for (let index = 0; index < state.highlights.length; index++) {
        const element = state.highlights[index];
        element.dispose();
    }
    state.highlights.length = 0;
    state.sensitive_ranges.length = 0;
}


export async function hl_animation_start(editor: vscode.TextEditor, sensitive_area: vscode.Range)
{
    let yellow = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 255, 0, 0.5)',
    });
    let animation_ranges: vscode.Range[] = [];
    let line0 = sensitive_area.start.line;
    let line1 = sensitive_area.end.line;
    try {
        while (fetchAPI.anything_still_working()) {
            await new Promise(resolve => setTimeout(resolve, 100));
            animation_ranges.length = 0;
            if (line0 >= 0) {
                let line0_txt = editor.document.lineAt(line0);
                animation_ranges.push(new vscode.Range(
                    new vscode.Position(line0, 0),
                    new vscode.Position(line0, line0_txt.text.length),
                ));
            }
            if (line1 < editor.document.lineCount) {
                let line1_txt = editor.document.lineAt(line1);
                animation_ranges.push(new vscode.Range(
                    new vscode.Position(line1, 0),
                    new vscode.Position(line1, line1_txt.text.length),
                ));
            }
            editor.setDecorations(yellow, animation_ranges);
            line0 -= 1;
            line1 += 1;
        }
    } finally {
        yellow.dispose();
    }
}

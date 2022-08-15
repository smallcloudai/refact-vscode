/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
const Diff = require('diff');  // Documentation: https://github.com/kpdecker/jsdiff/
import { clearHighlight, showHighlight, runHighlight, global_intent } from './highlight';


export enum Mode {
    Normal,
    Highlight,
    Diff,
    Accept
};


class CacheEntity {
    public editor: vscode.TextEditor;
    public sensitive_area: vscode.Range;
    public request: fetch.PendingRequest | undefined;
    public json: any;

    public constructor(editor: vscode.TextEditor, sensitive_area: vscode.Range) {
        this.editor = editor;
        this.sensitive_area = sensitive_area;
    }
}


class StateOfEditor {
    public editor: vscode.TextEditor;
    public originalCode: string;

    public mode = Mode.Normal;
    public highlights: any = [];

    public diffDecos: any = [];
    public diffDeletedLines: any = [];
    public diffAddedLines: any = [];

    public sensitive_ranges: vscode.DecorationOptions[] = [];
    public area2cache = new Map<Number, CacheEntity>();

    public highlight_json_backup: any = {};

    constructor(editor: vscode.TextEditor) {
        this.editor = editor;
        this.originalCode = editor.document.getText();
    }
};


// map editor to state of editor
let editor2state = new Map<vscode.TextEditor, StateOfEditor>();


export function getStateOfEditor(editor: vscode.TextEditor): StateOfEditor
{
    let state = editor2state.get(editor);
    if (!state) {
        state = new StateOfEditor(editor);
        editor2state.set(editor, state);
    }
    if (editor2state.size > 2) {
        let oldest_editor = editor2state.keys().next().value;
        // let oldest_state = editor2state.get(oldest_editor);
        editor2state.delete(oldest_editor);
        console.log(["forget state of", oldest_editor.document.fileName]);
    }
    return state;
}


export async function queryDiff(editor: vscode.TextEditor, sensitive_area: vscode.Range)
{
    let state = getStateOfEditor(editor);
    let doc = editor.document;
    let cache_key = doc.offsetAt(sensitive_area.start);
    let cache = state.area2cache.get(cache_key);
    if (!cache) {
        cache = new CacheEntity(editor, sensitive_area);
    }

    let cancellationTokenSource = new vscode.CancellationTokenSource();
    let cancelToken = cancellationTokenSource.token;
    let request = new fetch.PendingRequest(undefined, cancelToken);
    cache.request = request;

    fetch.cancelAllRequests();
    request.cancellationTokenSource = cancellationTokenSource;
    await fetch.waitAllRequests();
    if (cancelToken.isCancellationRequested) {
        return;
    }
    let file_name = doc.fileName;

    if (cache.json === undefined) {
        let sources: { [key: string]: string } = {};
        let whole_doc = doc.getText();
        sources[file_name] = whole_doc;
        let max_tokens = 150;
        let stop_tokens: string[] = [];
        let cursor = doc.offsetAt(sensitive_area.start);
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
        cache.json = json;
        state.area2cache.set(cache_key, cache);
        console.log(["cache_key", cache_key, state.area2cache.size]);
    }
    if (state.mode === Mode.Highlight && !cancelToken.isCancellationRequested) {
        let modif_doc = cache.json["choices"][0]["files"][file_name];
        offerDiff(editor, modif_doc);
    }
}


export function offerDiff(editor: vscode.TextEditor, modif_doc: string)
{
    let state = getStateOfEditor(editor);
    if (state.mode === Mode.Diff) {
        return;
    }
    let document = editor.document;
    let whole_doc = document.getText();
    const diff = Diff.diffLines(whole_doc, modif_doc);
    let green_bg_ranges: vscode.Range[] = [];
    let red_bg_ranges: vscode.Range[] = [];
    let very_green_bg_ranges: vscode.Range[] = [];
    let very_red_bg_ranges: vscode.Range[] = [];
    state.diffDeletedLines = [];
    state.diffAddedLines = [];
    editor.edit((e: vscode.TextEditorEdit) => {
        console.log(["result diff"]);
        let line_n = 0;
        let chunk_remember_removed = '';
        let chunk_remember_removed_line = -1;
        diff.forEach((part: any) => {
            let span = part.value;
            let span_lines = span.split('\n');
            let span_lines_count = span_lines.length - 1;
            if (part.removed) {
                console.log(["removed span_lines_count", span_lines_count, span]);
                red_bg_ranges.push(new vscode.Range(
                    new vscode.Position(line_n, 0),
                    new vscode.Position(line_n + span_lines_count - 1, 0),
                ));
                for (let i=0; i<span_lines_count; i++) {
                    state.diffDeletedLines.push(line_n + i);
                }
                chunk_remember_removed = span;
                chunk_remember_removed_line = line_n;
                line_n += span_lines_count;
            } else if (part.added) {
                console.log(["added span_lines_count", span_lines_count, span]);
                e.insert(
                    new vscode.Position(line_n, 0),
                    span
                    );
                green_bg_ranges.push(new vscode.Range(
                    new vscode.Position(line_n, 0),
                    new vscode.Position(line_n + span_lines_count - 1, 0),
                ));
                for (let i=0; i<span_lines_count; i++) {
                    state.diffAddedLines.push(line_n + i);
                }
                let chunk_remember_added = span;
                let chunk_remember_added_line = line_n;
                line_n += span_lines_count;
                if (chunk_remember_removed) {
                    const diff_char = Diff.diffWords(chunk_remember_removed, chunk_remember_added);
                    let char_del_line = chunk_remember_removed_line;
                    let char_ins_line = chunk_remember_added_line;
                    let char_del_pos = 0;
                    let char_ins_pos = 0;
                    diff_char.forEach((part_char: any) => {
                        let span_char = part_char.value;
                        if (part_char.removed) {
                            very_red_bg_ranges.push(new vscode.Range(
                                new vscode.Position(char_del_line, char_del_pos),
                                new vscode.Position(char_del_line, char_del_pos + span_char.length),
                            ));
                        } else if (part_char.added) {
                            very_green_bg_ranges.push(new vscode.Range(
                                new vscode.Position(char_ins_line, char_ins_pos),
                                new vscode.Position(char_ins_line, char_ins_pos + span_char.length),
                            ));
                        }
                        if (part_char.removed || part_char.added === undefined) {
                            for (let c=0; c<span_char.length; c++) {
                                if (span_char[c] === '\n') {
                                    char_del_line++;
                                    char_del_pos = 0;
                                } else {
                                    char_del_pos++;
                                }
                            }
                        }
                        if (part_char.added || part_char.removed === undefined) {
                            for (let c=0; c<span_char.length; c++) {
                                if (span_char[c] === '\n') {
                                    char_ins_line++;
                                    char_ins_pos = 0;
                                } else {
                                    char_ins_pos++;
                                }
                            }
                        }
                        console.log(["char", span_char]);
                    });
                }
                // now run diff chunk_accum
            } else {
                line_n += span_lines_count;
                console.log(["unchanged", span.length]);
                chunk_remember_removed = "";
            }
        });
    }, { undoStopBefore: false, undoStopAfter: false }).then(() => {
        let norm_fg = new vscode.ThemeColor('editor.foreground');
        // let ghost_text_color = new vscode.ThemeColor('editorGhostText.foreground');
        // let inserted_line_bg = new vscode.ThemeColor('diffEditor.insertedLineBackground');
        // let green_type = vscode.window.createTextEditorDecorationType({
        //     color: ghost_text_color,
        //     isWholeLine: true,
        // });
        let extension_path = vscode.extensions.getExtension('smc.codify')!.extensionPath;
        let green_type = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(0, 255, 0, 0.1)',
            color: norm_fg,
            isWholeLine: true,
            gutterIconPath: extension_path + '/images/add_line.svg',
            gutterIconSize: '40%',
        });
        let very_green_type = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(0, 255, 0, 0.30)',
            color: norm_fg,
        });
        // let red_path = vscode.Uri.file('././images/add_plus_icon.svg');
        let red_type = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.1)',
            isWholeLine: true,
            gutterIconPath: extension_path + '/images/remove_line.svg',
            gutterIconSize: '40%',
        });
        let very_red_type = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.30)',
        });
        editor.setDecorations(green_type, green_bg_ranges);
        editor.setDecorations(red_type, red_bg_ranges);
        editor.setDecorations(very_green_type, very_green_bg_ranges);
        editor.setDecorations(very_red_type, very_red_bg_ranges);
        let state = getStateOfEditor(editor);
        state.diffDecos.push(green_type);
        state.diffDecos.push(red_type);
        state.diffDecos.push(very_green_type);
        state.diffDecos.push(very_red_type);
        state.mode = Mode.Diff;
        clearHighlight(editor);
        vscode.commands.executeCommand('setContext', 'codify.runEsc', true);
        console.log(["ESC ON DIFF"]);
        vscode.commands.executeCommand('setContext', 'codify.runTab', true);
        console.log(["TAB ON DIFF"]);
    });
}

export function removeDeco(editor: vscode.TextEditor)
{
    let state = getStateOfEditor(editor);
    if (state.mode !== Mode.Diff) {
        return;
    }
    for (let deco of state.diffDecos) {
        editor.setDecorations(deco, []);
    }
    state.diffDecos.length = 0;
    state.diffAddedLines.length = 0;
    state.diffDeletedLines.length = 0;
}

export function rollback(editor: vscode.TextEditor)
{
    let state = getStateOfEditor(editor);
    if (state.mode !== Mode.Diff) {
        return;
    }
    editor.edit((e) => {
        for (let i=0; i<state.diffAddedLines.length; i++) {
            e.delete(new vscode.Range(
                new vscode.Position(state.diffAddedLines[i], 0),
                new vscode.Position(state.diffAddedLines[i] + 1, 0),
            ));
            // console.log(["rollback", state.diffAddedLines[i]]);
        }
    }, { undoStopBefore: false, undoStopAfter: false }).then(() => {
        removeDeco(editor);
        vscode.commands.executeCommand('setContext', 'codify.runTab', false);
        console.log(["TAB OFF DIFF"]);
        vscode.commands.executeCommand('setContext', 'codify.runEsc', false);
        console.log(["ESC OFF DIFF"]);
        if (state.highlight_json_backup) {
            showHighlight(editor, state.highlight_json_backup);
            state.mode = Mode.Highlight;
        } else {
            state.mode = Mode.Normal;
        }
    });
}

export function accept(editor: vscode.TextEditor)
{
    let state = getStateOfEditor(editor);
    if (state.mode !== Mode.Diff) {
        return;
    }
    editor.edit((e) => {
        for (let i=0; i<state.diffDeletedLines.length; i++) {
            e.delete(new vscode.Range(
                new vscode.Position(state.diffDeletedLines[i], 0),
                new vscode.Position(state.diffDeletedLines[i] + 1, 0),
            ));
            // console.log(["accept", state.diffDeletedLines[i]]);
        }
    }, { undoStopBefore: false, undoStopAfter: true }).then(() => {
        removeDeco(editor);
        vscode.commands.executeCommand('setContext', 'codify.runTab', false);
        console.log(["TAB OFF DIFF"]);
        vscode.commands.executeCommand('setContext', 'codify.runEsc', false);
        console.log(["ESC OFF DIFF"]);
        state.area2cache.clear();
        state.mode = Mode.Normal;
        clearHighlight(editor);
        runHighlight(editor, undefined);
    });
}

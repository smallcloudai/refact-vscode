/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
const Diff = require('diff');  // Documentation: https://github.com/kpdecker/jsdiff/
import * as editChaining from "./editChaining";
import * as estate from './estate';
import * as highlight from "./highlight";


let global_nav_counter: number = 0;


export function onCursorMoved(editor: vscode.TextEditor, pos: vscode.Position)
{
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    global_nav_counter += 1;
    for (let i = 0; i < state.sensitive_ranges.length; i++) {
        const element = state.sensitive_ranges[i];
        if (element.range.contains(pos)) {
            let my_counter = global_nav_counter;
            setTimeout(() => {
                if (!state) {
                    return;
                }
                if (global_nav_counter === my_counter) {
                    queryDiff(editor, element.range, "diff-atcursor");
                }
            }, 300);
        }
    }
    let selection = editor.selection;
    let is_empty = selection.anchor.line === selection.active.line && selection.anchor.character === selection.active.character;
    if (!is_empty && !state.diff_changing_doc) {;
        handsOff(editor);
    }
}


export async function queryDiff(editor: vscode.TextEditor, sensitive_area: vscode.Range, model_function: string)
{
    // We get there every time the cursor moves (very often).
    // NOT called from estate switch mode
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    let doc = editor.document;
    // let cache_key = doc.offsetAt(sensitive_area.start) + 10000*doc.offsetAt(sensitive_area.end);
    // let cache = state.area2cache.get(cache_key);
    // if (!cache) {
    //     cache = new estate.CacheEntity(editor, sensitive_area);
    // }

    let cancellationTokenSource = new vscode.CancellationTokenSource();
    let cancelToken = cancellationTokenSource.token;
    let request = new fetch.PendingRequest(undefined, cancelToken);
    // cache.request = request;

    fetch.cancelAllRequests();
    estate.back_to_normal(state);
    request.cancellationTokenSource = cancellationTokenSource;
    let login: any = await fetch.login();
    if (!login) { return; }
    await fetch.waitAllRequests();
    if (cancelToken.isCancellationRequested) {
        return;
    }
    let file_name = fetch.filename_from_document(doc);

    let json: any;
    // if (cache.json === undefined) {
        await estate.switch_mode(state, estate.Mode.DiffWait);
        animationStart(editor, sensitive_area);
        let sources: { [key: string]: string } = {};
        let whole_doc = doc.getText();
        sources[file_name] = whole_doc;
        let max_tokens = 200;
        let stop_tokens: string[] = [];
        request.supplyStream(fetch.fetchAPI(
            cancelToken,
            sources,
            estate.global_intent,
            model_function,
            file_name,
            doc.offsetAt(sensitive_area.start),
            doc.offsetAt(sensitive_area.end),
            max_tokens,
            model_function==="diff-atcursor" ? 1 : 10,
            stop_tokens,
        ));
        state.report_to_mothership_sources = sources;
        state.report_to_mothership_intent = estate.global_intent;
        state.report_to_mothership_function = model_function;
        state.report_to_mothership_cursor_file = file_name;
        state.report_to_mothership_cursor_pos0 = doc.offsetAt(sensitive_area.start);
        state.report_to_mothership_cursor_pos1 = doc.offsetAt(sensitive_area.end);
        state.report_to_mothership_ts = Date.now();
        try {
            json = await request.apiPromise;
        } finally {
            if (fetch.look_for_common_errors(json)) {
                if (state.get_mode() === estate.Mode.DiffWait) {
                    await estate.switch_mode(state, estate.Mode.Normal);
                }
                return;
            }
        }
        // cache.json = json;
        // state.area2cache.set(cache_key, cache);
        // console.log(["saving diff", cache_key, "size", state.area2cache.size]);
        if (state.get_mode() !== estate.Mode.DiffWait) {
            return;
        }
        if (cancelToken.isCancellationRequested) {
            if (state.get_mode() === estate.Mode.DiffWait) {
                await estate.switch_mode(state, estate.Mode.Normal);
            }
            return;
        }
    // } else {
    //     console.log(["get cached diff", cache_key, "size", state.area2cache.size]);
    // }
    if (!cancelToken.isCancellationRequested) {
        // if (cache.json && cache.json["choices"]) {
        //     let modif_doc = cache.json["choices"][0]["files"][file_name];
        if (json && json["choices"]) {
            let modif_doc = json["choices"][0]["files"][file_name];
            state.report_to_mothership_results = json["choices"][0]["files"];
            state.showing_diff_for_range = sensitive_area;
            state.showing_diff_for_function = model_function;
            state.showing_diff_edit_chain = undefined;
            state.showing_diff_modif_doc = modif_doc;
            await estate.switch_mode(state, estate.Mode.Diff);
        }
    }
    if (state.get_mode() === estate.Mode.DiffWait) {
        await estate.switch_mode(state, estate.Mode.Normal);
    }
}

export async function animationStart(editor: vscode.TextEditor, sensitive_area: vscode.Range)
{
    highlight.clearHighlight(editor);
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    let animation_decos: vscode.TextEditorDecorationType[] = [];
    let animation_ranges: vscode.Range[][] = [];
    for (let c=0; c<20; c++) {
        let phase = c / 10;
        let red =   Math.max(100, Math.floor(255 * Math.sin(phase * Math.PI + Math.PI)));
        let blue =  Math.max(100, Math.floor(255 * Math.sin(phase * Math.PI + Math.PI / 2)));
        let green = Math.max(100, Math.floor(255 * Math.sin(phase * Math.PI + 3 * Math.PI / 2)));
        let red_str = red.toString();
        let green_str = green.toString();
        let blue_str = blue.toString();
        animation_decos.push(vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(' + red_str + ', ' + green_str + ', ' + blue_str + ', 0.3)',
            // isWholeLine: true,
        }));
        animation_ranges.push([]);
    }
    let t = 0;
    while (state.get_mode() === estate.Mode.DiffWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
        for (let a=0; a<animation_decos.length; a++) {
            animation_ranges[a].length = 0;
        }
        for (let line_n=sensitive_area.start.line; line_n<=sensitive_area.end.line; line_n++) {
            let line = editor.document.lineAt(line_n);
            for (let c=0; c<line.text.length; c+=2) {
                let a = (line_n + c + t) % animation_decos.length;
                let range = new vscode.Range(
                    new vscode.Position(line_n, c),
                    new vscode.Position(line_n, c+2),
                );
                animation_ranges[a].push(range);
            }
        }
        for (let a=0; a<animation_decos.length; a++) {
            editor.setDecorations(animation_decos[a], animation_ranges[a]);
        }
        t += 1;
    }
    for (let a=0; a<animation_decos.length; a++) {
        animation_decos[a].dispose();
    }
}

export async function showEditChainDiff(editor: vscode.TextEditor)
{
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    let modif_doc = state.edit_chain_modif_doc;
    if (modif_doc) {
        state.showing_diff_for_range = undefined;
        state.showing_diff_for_function = "edit-chain";
        await offerDiff(editor, modif_doc, true);
    }
}

export async function offerDiff(editor: vscode.TextEditor, modif_doc: string, move_cursor: boolean)
{
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    removeDeco(editor);
    highlight.clearHighlight(editor);
    let document = editor.document;
    let whole_doc = document.getText();
    const diff = Diff.diffLines(whole_doc, modif_doc);
    let green_bg_ranges: vscode.Range[] = [];
    let red_bg_ranges: vscode.Range[] = [];
    let very_green_bg_ranges: vscode.Range[] = [];
    let very_red_bg_ranges: vscode.Range[] = [];
    state.diffDeletedLines = [];
    state.diffAddedLines = [];
    state.diff_changing_doc = true;
    await editor.edit((e: vscode.TextEditorEdit) => {
        let line_n = 0;
        let line_n_insert = 0;
        let chunk_remember_removed = '';
        let chunk_remember_removed_line = -1;
        diff.forEach((part: any) => {
            if (!state) {
                return;
            }
            let span = part.value;
            let span_lines = span.split('\n');
            let span_lines_count = span_lines.length - 1;
            if (part.removed) {
                // console.log(["removed span_lines_count", span_lines_count, span]);
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
                line_n_insert += span_lines_count;
            } else if (part.added) {
                // console.log(["added span_lines_count", span_lines_count, span]);
                e.insert(
                    new vscode.Position(line_n_insert, 0),
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
                        // console.log(["char", span_char]);
                    });
                }
            } else {
                line_n += span_lines_count;
                line_n_insert += span_lines_count;
                // console.log(["unchanged", span.length]);
                chunk_remember_removed = "";
            }
        });
    }, { undoStopBefore: false, undoStopAfter: false }).then(() => {
        let state = estate.state_of_editor(editor);
        if (!state) {
            return;
        }
        state.diff_changing_doc = false;
        let norm_fg = new vscode.ThemeColor('editor.foreground');
        // let ghost_text_color = new vscode.ThemeColor('editorGhostText.foreground');
        // let inserted_line_bg = new vscode.ThemeColor('diffEditor.insertedLineBackground');
        // let green_type = vscode.window.createTextEditorDecorationType({
        //     color: ghost_text_color,
        //     isWholeLine: true,
        // });
        let extension_path = vscode.extensions.getExtension('smallcloud.codify')!.extensionPath;
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
        let scroll_to: number[] = [];
        if (state.diffAddedLines.length > 0) {
            scroll_to.push(state.diffAddedLines[0]);
            scroll_to.push(state.diffAddedLines[state.diffAddedLines.length - 1]);
        }
        if (state.diffDeletedLines.length > 0) {
            scroll_to.push(state.diffDeletedLines[0]);
            scroll_to.push(state.diffDeletedLines[state.diffDeletedLines.length - 1]);
        }
        if (scroll_to.length > 0) {
            let reveal_range = new vscode.Range(
                new vscode.Position(Math.min(...scroll_to), 0),
                new vscode.Position(Math.max(...scroll_to), 0),
            );
            editor.revealRange(reveal_range);
            if (move_cursor) {
                editor.selection = new vscode.Selection(reveal_range.start, reveal_range.start);
            }
        }
        state.diffDecos.push(green_type);
        state.diffDecos.push(red_type);
        state.diffDecos.push(very_green_type);
        state.diffDecos.push(very_red_type);
    });
}


export function removeDeco(editor: vscode.TextEditor)
{
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    for (let deco of state.diffDecos) {
        deco.dispose();
    }
    state.diffDecos.length = 0;
    state.diffAddedLines.length = 0;
    state.diffDeletedLines.length = 0;
}


export async function rollback(editor: vscode.TextEditor)
{
    editChaining.cleanupEditChaining(editor);
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    state.diff_changing_doc = true;
    await editor.edit((e) => {
        if (!state) {
            return;
        }
        for (let i=0; i<state.diffAddedLines.length; i++) {
            e.delete(new vscode.Range(
                new vscode.Position(state.diffAddedLines[i], 0),
                new vscode.Position(state.diffAddedLines[i] + 1, 0),
            ));
        }
    }, { undoStopBefore: false, undoStopAfter: false }).then(() => {
        if (!state) {
            return;
        }
        state.diff_changing_doc = false;
        removeDeco(editor);
        if (state.report_to_mothership_cursor_file) {
            fetch.report_to_mothership(
                false,
                state.report_to_mothership_sources,
                state.report_to_mothership_results,
                state.report_to_mothership_intent,
                state.report_to_mothership_function,
                state.report_to_mothership_cursor_file,
                state.report_to_mothership_cursor_pos0,
                state.report_to_mothership_cursor_pos1,
                state.report_to_mothership_ts,
            );
        }
        state.report_to_mothership_cursor_file = "";
    });
}


export async function accept(editor: vscode.TextEditor)
{
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    state.diff_changing_doc = true;
    let thenable = editor.edit((e) => {
        if (!state) {
            return;
        }
        for (let i=0; i<state.diffDeletedLines.length; i++) {
            e.delete(new vscode.Range(
                new vscode.Position(state.diffDeletedLines[i], 0),
                new vscode.Position(state.diffDeletedLines[i] + 1, 0),
            ));
            // console.log(["accept", state.diffDeletedLines[i]]);
        }
    }, { undoStopBefore: false, undoStopAfter: true });
    thenable.then(() => {
        if (!state) {
            return;
        }
        state.diff_changing_doc = false;
        removeDeco(editor);
        vscode.commands.executeCommand('setContext', 'codify.runTab', false);
        console.log(["TAB OFF DIFF"]);
        vscode.commands.executeCommand('setContext', 'codify.runEsc', false);
        console.log(["ESC OFF DIFF"]);
        // state.area2cache.clear();
        if (state.highlight_json_backup) {
            state.highlight_json_backup = undefined;
            estate.back_to_normal(state);
            highlight.runHighlight(editor, undefined);
        } else {
            state.highlight_json_backup = undefined;
            estate.back_to_normal(state);
            console.log(["TRIGGER SUGGEST"]);
            state.inline_prefer_edit_chaining = true;
            vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        }
        if (state.report_to_mothership_cursor_file) {
            fetch.report_to_mothership(
                true,
                state.report_to_mothership_sources,
                state.report_to_mothership_results,
                state.report_to_mothership_intent,
                state.report_to_mothership_function,
                state.report_to_mothership_cursor_file,
                state.report_to_mothership_cursor_pos0,
                state.report_to_mothership_cursor_pos1,
                state.report_to_mothership_ts,
            );
            state.report_to_mothership_cursor_file = "";
        }
    });
    await thenable;
}


export async function regen(editor: vscode.TextEditor)
{
    editChaining.cleanupEditChaining(editor);
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    if (state.showing_diff_edit_chain !== undefined) {
        await editChaining.runEditChaining(true);
        await showEditChainDiff(editor);
        return;
    }
    if (state.showing_diff_for_range !== undefined && state.showing_diff_for_function !== undefined) {
        removeDeco(editor);
        // state.area2cache.clear();
        queryDiff(editor, state.showing_diff_for_range, state.showing_diff_for_function);
    }
}


export function handsOff(editor: vscode.TextEditor)
{
    // Don't delete anything, user has already started same edit, leave it alone
    let state = estate.state_of_editor(editor);
    if (!state) {
        return;
    }
    state.edit_chain_modif_doc = undefined;
    removeDeco(editor);
}

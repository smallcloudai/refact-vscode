/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as highlight from "./highlight";
import * as interactiveDiff from "./interactiveDiff";
import * as codeLens from "./codeLens";
import * as completionProvider from "./completionProvider";

export let global_intent: string = "Fix";


export enum Mode {
    Normal,
    Highlight,
    Diff,
    DiffWait,
    Dispose,
};


export class ApiFields {
    public scope: string = "";
    public positive: boolean = false;
    public url: string = "";
    public model: string = "";
    public function: string = "";
    public intent: string = "";
    public sources: { [key: string]: string } = {};
    public results: { [key: string]: string } = {};
    public messages: [string, string][] = [];
    public cursor_file: string = "";
    public cursor_pos0: number = 0;
    public cursor_pos1: number = 0;
    public ts_req: number = 0;
    public ts_presented: number = 0;
    public ts_reacted: number = 0;
    public serial_number: number = 0;
};


export class StateOfEditor {
    public editor: vscode.TextEditor;

    _mode: Mode = Mode.Normal;
    public get_mode(): Mode {
        return this._mode;
    }
    public last_used_ts: number = 0;
    public fn: string = "";

    public inline_prefer_edit_chaining: boolean = false; // Delete?

    public highlight_json_backup: any = undefined;
    public highlights: any = [];
    public sensitive_ranges: vscode.DecorationOptions[] = [];

    public diff_changing_doc: boolean = false;
    public diffDecos: any = [];
    public diffDeletedLines: any = [];
    public diffAddedLines: any = [];

    public diff_lens_pos: number = Number.MAX_SAFE_INTEGER;
    public completion_lens_pos: number = Number.MAX_SAFE_INTEGER;
    public completion_longthink: number = 0;
    public completion_reset_on_cursor_movement: boolean = false;

    public showing_diff_modif_doc: string | undefined;
    public showing_diff_move_cursor: boolean = false;
    public showing_diff_for_range: vscode.Range | undefined = undefined;
    public showing_diff_for_function: string | undefined = undefined;
    public showing_diff_edit_chain: vscode.Range | undefined = undefined;
    public diff_load_animation_head: number = 0;
    public diff_load_animation_mid: string = "";

    public edit_chain_modif_doc: string | undefined = undefined;

    public cursor_move_event: vscode.Disposable|undefined = undefined;
    public text_edited_event: vscode.Disposable|undefined = undefined;

    public data_feedback_candidate: ApiFields|undefined = undefined;

    constructor(editor: vscode.TextEditor)
    {
        this.editor = editor;
    }

    public cache_clear()
    {
        // call on text edited, intent change
        // this.area2cache.clear();
        this.highlight_json_backup = undefined;
        this.sensitive_ranges.length = 0;
        this.highlights.length = 0;
    }
};


let editor2state = new Map<vscode.TextEditor, StateOfEditor>();


export function is_lang_enabled(document: vscode.TextDocument): boolean
{
    let lang = document.languageId;
    let enabled: boolean|undefined = vscode.workspace.getConfiguration().get(`codify.lang.${lang}`);
    if (enabled === undefined || enabled === true || enabled === null) {
        return true;
    }
    return false;
}


export function state_of_editor(editor: vscode.TextEditor|undefined, reqfrom: string): StateOfEditor | undefined
{
    if (!editor) {
        return undefined;
    }
    if (editor2state.size > 3) {
        let oldest_ts = Number.MAX_SAFE_INTEGER;
        let oldest_state: StateOfEditor | undefined = undefined;
        for (let [_, state] of editor2state) {
            if (state.last_used_ts < oldest_ts) {
                oldest_ts = state.last_used_ts;
                oldest_state = state;
            }
        }
        if (!oldest_state) {
            throw new Error("Internal error");
        }
        console.log(["forget state of", oldest_state.editor.document.fileName, oldest_state.fn]);
        switch_mode(oldest_state, Mode.Dispose);
        editor2state.delete(oldest_state.editor);
    }
    let state = editor2state.get(editor);
    if (!state) {
        let current_editor = vscode.window.activeTextEditor;
        for (const [other_editor, other_state] of editor2state) {
            if (other_editor.document === editor.document) {
                if (other_state.editor === current_editor) {
                    console.log([reqfrom, "return other AKA current", other_state.fn]);
                    return other_state;
                }
                if (editor === current_editor) {
                    console.log([reqfrom, "delete/add AKA new is current", other_state.fn]);
                    editor2state.delete(other_editor);
                    editor2state.set(editor, other_state);
                    state = other_state;
                    state.editor = editor;
                    break;
                }
            }
        }
    } else {
        console.log([reqfrom, "found", state.fn]);
    }
    if (!state) {
        state = new StateOfEditor(editor);
        state.last_used_ts = Date.now();
        state.fn = editor.document.fileName;
        editor2state.set(editor, state);
        console.log([reqfrom, "create new", state.fn]);
    }
    state.last_used_ts = Date.now();
    return state;
}


export function state_of_document(doc: vscode.TextDocument): StateOfEditor | undefined
{
    let candidates_list = [];
    for (const [editor, state] of editor2state) {
        if (editor.document === doc) {
            candidates_list.push(state);
        }
    }
    if (candidates_list.length === 0) {
        return undefined;
    }
    if (candidates_list.length === 1) {
        return candidates_list[0];
    }
    console.log(["multiple editors/states for the same document, taking the most recent...", doc.fileName]);
    let most_recent_ts = 0;
    let most_recent_state: StateOfEditor | undefined = undefined;
    for (let state of candidates_list) {
        if (state.last_used_ts > most_recent_ts) {
            most_recent_ts = state.last_used_ts;
            most_recent_state = state;
        }
    }
    return most_recent_state;
}


export async function switch_mode(state: StateOfEditor, new_mode: Mode)
{
    let old_mode = state._mode;
    console.log(["switch mode", old_mode, new_mode]);
    state._mode = new_mode;

    if (old_mode === Mode.Diff) {
        await interactiveDiff.dislike_and_rollback(state.editor);
        vscode.commands.executeCommand('setContext', 'codify.runTab', false);
        vscode.commands.executeCommand('setContext', 'codify.runEsc', false);
    } else if (old_mode === Mode.Highlight) {
        highlight.hl_clear(state.editor);
    } else if (old_mode === Mode.DiffWait) {
        highlight.hl_clear(state.editor);
    }

    if (new_mode === Mode.Diff) {
        if (state.showing_diff_modif_doc !== undefined) {
            await interactiveDiff.present_diff_to_user(state.editor, state.showing_diff_modif_doc, state.showing_diff_move_cursor);
            state.showing_diff_move_cursor = false;
            vscode.commands.executeCommand('setContext', 'codify.runTab', true);
            vscode.commands.executeCommand('setContext', 'codify.runEsc', true);
        } else {
            console.log(["cannot enter diff state, no diff modif doc"]);
        }
    }
    if (new_mode === Mode.Highlight) {
        state.diff_lens_pos = Number.MAX_SAFE_INTEGER;
        codeLens.quick_refresh();
        if (state.highlight_json_backup !== undefined) {
            highlight.hl_show(state.editor, state.highlight_json_backup);
        } else {
            console.log(["cannot enter highlight state, no hl json"]);
        }
    }
    // if (new_mode === Mode.Normal) {
    // }
    if (new_mode !== Mode.Dispose) {
        keyboard_events_on(state.editor);
    }
    if (new_mode !== Mode.Normal) {
        vscode.commands.executeCommand('setContext', 'codify.runEsc', true);
    } else {
        // keyboard_events_off(state);
    }
}


export async function back_to_normal(state: StateOfEditor)
{
    await switch_mode(state, Mode.Normal);
}


export function keyboard_events_on(editor: vscode.TextEditor)
{
    let state = state_of_editor(editor, "keyb_on");
    if (!state) {
        return;
    }
    if (state.cursor_move_event) {
        state.cursor_move_event.dispose();
    }
    if (state.text_edited_event) {
        state.text_edited_event.dispose();
    }
    state.cursor_move_event = vscode.window.onDidChangeTextEditorSelection(async (ev: vscode.TextEditorSelectionChangeEvent) => {
        completionProvider.on_cursor_moved();
        let is_mouse = ev.kind === vscode.TextEditorSelectionChangeKind.Mouse;
        let ev_editor = ev.textEditor;
        let pos1 = ev_editor.selection.active;
        if(global.side_panel !== undefined) {
            let selected_lines = 0;
            if (!ev_editor.selection.isEmpty) {
                selected_lines = 1 + ev_editor.selection.end.line - ev_editor.selection.start.line;
            }
            global.side_panel.editor_inform_how_many_lines_selected(selected_lines);
        }
        if (!editor || editor !== ev_editor) {
            return;
        }
        await interactiveDiff.on_cursor_moved(editor, pos1, is_mouse);
        if (state && state.completion_reset_on_cursor_movement) {
            state.completion_lens_pos = Number.MAX_SAFE_INTEGER;
            state.completion_longthink = 0;
            codeLens.quick_refresh();
        }
    });
    state.text_edited_event = vscode.workspace.onDidChangeTextDocument((ev: vscode.TextDocumentChangeEvent) => {
        completionProvider.on_text_edited();
        let doc = ev.document;
        let ev_doc = editor.document;
        if (doc !== ev_doc) {
            return;
        }
        on_text_edited(editor);
    });
}


function keyboard_events_off(state: StateOfEditor)
{
    if (state.cursor_move_event !== undefined) {
        state.cursor_move_event.dispose();
        state.cursor_move_event = undefined;
    }
    if (state.text_edited_event !== undefined) {
        state.text_edited_event.dispose();
        state.text_edited_event = undefined;
    }
}


export function on_text_edited(editor: vscode.TextEditor)
{
    let state = state_of_editor(editor, "text_edited");
    if (!state) {
        return;
    }
    if (state.diff_changing_doc) {
        console.log(["text edited, do nothing"]);
        return;
    }
    if (state._mode === Mode.Diff || state._mode === Mode.DiffWait) {
        console.log(["text edited mode", state._mode, "hands off"]);
        interactiveDiff.hands_off_dont_remove_anything(editor);
        state.highlight_json_backup = undefined;
        state.diff_lens_pos = Number.MAX_SAFE_INTEGER;
        state.completion_lens_pos = Number.MAX_SAFE_INTEGER;
        // state.area2cache.clear();
        switch_mode(state, Mode.Normal);
    } else if (state._mode === Mode.Highlight) {
        highlight.hl_clear(editor);
        state.highlight_json_backup = undefined;
        // state.area2cache.clear();
        switch_mode(state, Mode.Normal);
    } else if (state._mode === Mode.Normal) {
        // state.area2cache.clear();
        state.highlight_json_backup = undefined;
    }
}


function on_change_active_editor(editor: vscode.TextEditor | undefined)
{
    if (!editor) {
        return;
    }
    let state_stored = editor2state.get(editor);
    if (!state_stored) {
        let state = state_of_editor(editor, "change_active");
        if (state) {
            // this does almost nothing, but the state will be there for inline completion to pick up
            switch_mode(state, Mode.Normal);
        }
    }
}


export function estate_init()
{
    let disposable9 = vscode.window.onDidChangeActiveTextEditor(on_change_active_editor);
    let current_editor = vscode.window.activeTextEditor;
    if (current_editor) {
        on_change_active_editor(current_editor);
    }
    return [disposable9];
}


export function save_intent(intent: string)
{
    if (global_intent !== intent) {
        global_intent = intent;
        for (const [editor, state] of editor2state) {
            // state.area2cache.clear();
            state.highlight_json_backup = undefined;
        }
    }
}

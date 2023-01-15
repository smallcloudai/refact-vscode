/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as highlight from "./highlight";
import * as interactiveDiff from "./interactiveDiff";
import * as codeLens from "./codeLens";


export let global_intent: string = "Fix";


export enum Mode {
    Normal,
    Highlight,
    Diff,
    DiffWait,
};


export class DataCollectStruct {
    public positive: boolean = false;
    public sources: { [key: string]: string } = {};
    public results: { [key: string]: string } = {};
    public intent: string = "";
    public function: string = "";
    public cursor_file: string = "";
    public cursor_pos0: number = 0;
    public cursor_pos1: number = 0;
    public ts: number = 0;
};


export class StateOfEditor {
    public editor: vscode.TextEditor;

    _mode: Mode = Mode.Normal;
    public get_mode(): Mode {
        return this._mode;
    }
    public last_used_ts: number = 0;

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
    public completion_no_cache: number = 0;
    public completion_reset_on_cursor_movement: boolean = false;

    public showing_diff_modif_doc: string | undefined;
    public showing_diff_move_cursor: boolean = false;
    public showing_diff_for_range: vscode.Range | undefined = undefined;
    public showing_diff_for_function: string | undefined = undefined;
    public showing_diff_edit_chain: vscode.Range | undefined = undefined;

    public edit_chain_modif_doc: string | undefined = undefined;

    public cursor_move_event: vscode.Disposable|undefined = undefined;
    public text_edited_event: vscode.Disposable|undefined = undefined;

    public data_feedback_candidate: DataCollectStruct|undefined = undefined;

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


export function state_of_editor(editor: vscode.TextEditor|undefined): StateOfEditor | undefined
{
    if (!editor) {
        return undefined;
    }
    if (!is_lang_enabled(editor.document)) {
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
        console.log(["forget state of", oldest_state.editor.document.fileName]);
        switch_mode(oldest_state, Mode.Normal);
        editor2state.delete(oldest_state.editor);
    }
    let state = editor2state.get(editor);
    if (!state) {
        state = new StateOfEditor(editor);
        editor2state.set(editor, state);
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
    if (new_mode === Mode.Normal) {
        state.diff_lens_pos = Number.MAX_SAFE_INTEGER;
        codeLens.quick_refresh();
    }
    keyboard_events_on(state.editor);
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
    let state = state_of_editor(editor);
    if (!state) {
        return;
    }
    if (state.cursor_move_event) {
        state.cursor_move_event.dispose();
    }
    if (state.text_edited_event) {
        state.text_edited_event.dispose();
    }
    state.cursor_move_event = vscode.window.onDidChangeTextEditorSelection((ev: vscode.TextEditorSelectionChangeEvent) => {
        let ev_editor = ev.textEditor;
        if (!editor || editor !== ev_editor) {
            return;
        }
        let is_mouse = ev.kind === vscode.TextEditorSelectionChangeKind.Mouse;
        let pos1 = editor.selection.active;
        let pos2 = editor.selection.anchor;
        if (pos1.line === pos2.line && pos1.character === pos2.character) {
            interactiveDiff.on_cursor_moved(editor, pos1, is_mouse);
        }
        if (state && state.completion_reset_on_cursor_movement) {
            state.completion_lens_pos = Number.MAX_SAFE_INTEGER;
            codeLens.quick_refresh();
        }
    });
    state.text_edited_event = vscode.workspace.onDidChangeTextDocument((ev: vscode.TextDocumentChangeEvent) => {
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
    let state = state_of_editor(editor);
    if (!state) {
        return;
    }
    if (state.diff_changing_doc) {
        console.log(["text edited, do nothing"]);
        return;
    }
    if (state._mode === Mode.Diff || state._mode === Mode.DiffWait) {
        console.log(["text edited mode", state._mode, "hands off"]);
        interactiveDiff.hands_off_dont_remove_presentation(editor);
        state.highlight_json_backup = undefined;
        state.diff_lens_pos = Number.MAX_SAFE_INTEGER;
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
    if (global.current_editor_text_edited_event) {
        global.current_editor_text_edited_event.dispose();
        global.current_editor_text_edited_event = undefined;
    }
    global.current_editor_text_edited_event = vscode.workspace.onDidChangeTextDocument((ev: vscode.TextDocumentChangeEvent) => {
        if (!editor) {
            return;
        }
        let state_stored = editor2state.get(editor);
        if (!state_stored) {
            let state = state_of_editor(editor);
            if (state) {
                // this does almost nothing, but the state will be there for inline completion to pick up
                switch_mode(state, Mode.Normal);
            }
        }
    });
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

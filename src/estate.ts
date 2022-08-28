/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
const Diff = require('diff');  // Documentation: https://github.com/kpdecker/jsdiff/
import * as editChaining from "./editChaining";
import { clearHighlight, showHighlight, runHighlight, backToNormal, global_intent } from './highlight';


export enum Mode {
    Normal,
    Highlight,
    Diff,
    DiffWait,
    DiffChangingDoc,
};


export class CacheEntity {
    public editor: vscode.TextEditor;
    public sensitive_area: vscode.Range;
    public request: fetch.PendingRequest | undefined;
    public json: any;

    public constructor(editor: vscode.TextEditor, sensitive_area: vscode.Range) {
        this.editor = editor;
        this.sensitive_area = sensitive_area;
    }
}


export class StateOfEditor {
    public editor: vscode.TextEditor;

    public mode = Mode.Normal;
    public highlights: any = [];

    public diffDecos: any = [];
    public diffDeletedLines: any = [];
    public diffAddedLines: any = [];

    public sensitive_ranges: vscode.DecorationOptions[] = [];
    public area2cache = new Map<Number, CacheEntity>();
    public showing_diff_for_range: vscode.Range | undefined = undefined;
    public showing_diff_for_function: string | undefined = undefined;
    public showing_diff_edit_chain: vscode.Range | undefined = undefined;

    public edit_chain_modif_doc: string | undefined = undefined;

    public highlight_json_backup: any = undefined;

    constructor(editor: vscode.TextEditor) {
        this.editor = editor;
    }
};


let editor2state = new Map<vscode.TextEditor, StateOfEditor>();


export function state_of_editor(editor: vscode.TextEditor): StateOfEditor
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


export function state_of_document(doc: vscode.TextDocument): StateOfEditor | undefined
{
    for (const [editor, state] of editor2state) {
        if (editor.document === doc) {
            return state;
        }
    }
    return undefined;
}


export function switch_state(state: StateOfEditor, new_mode: Mode)
{
    let old_mode = state.mode;
    state.mode = new_mode;

}


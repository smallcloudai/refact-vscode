/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
const Diff = require('diff');  // Documentation: https://github.com/kpdecker/jsdiff/


class StateOfEditor {
    public editor: vscode.TextEditor;
    public originalCode: string;

    public highlights: any = [];

    public diffType: any = [];
    public diffAdd: any = [];
    public diffRemove: any = [];
    public diffFull: any = [];
    public diffCode: string = "";
    // public last_touched_ts: number = 0;

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


export function offerDiff(editor: vscode.TextEditor, modif_doc: string)
{
    let document = editor.document;
    let whole_doc = document.getText();
    const diff = Diff.diffLines(whole_doc, modif_doc);
    // currentMode = Mode.Diff;
    let improved_doc = '';

    diff.forEach((part: any) => {
        let span = part.value;
        improved_doc += span;
    });

    let firstLine = document.lineAt(0);
    let lastLine = document.lineAt(document.lineCount - 1);
    let textRange = new vscode.Range(
        0,
        firstLine!.range.start.character,
        document.lineCount - 1,
        lastLine!.range.end.character,
        );

    editor.edit((selectedText) => {
        selectedText.replace(textRange, improved_doc);
    }).then(() => {
        makeDiffLines(editor, diff, textRange);
    });
}

export function makeDiffLines(editor: vscode.TextEditor, diff: any, rng: any)
{
    let state = getStateOfEditor(editor);
    let doc = editor.document;
    // diffFetching = false;
    let range = rng;
    let decoration = { range };
    state.diffFull.push(decoration);

    diff.forEach((part: any) => {
        if (part.removed) {
            let st = doc.getText().indexOf(part.value);
            let ed = st + part.value.length;
            let pos_start = doc.positionAt(st);
            let pos_end = doc.positionAt(ed);
            let range = new vscode.Range(pos_start,pos_end);
            let decoration = { range };
            state.diffRemove.push(decoration);
        }
        if (part.added) {
            let st = doc.getText().indexOf(part.value);
            let ed = st + part.value.length;

            let pos_start = doc.positionAt(st);
            let pos_end = doc.positionAt(ed - 1);

            let range = new vscode.Range(pos_start,pos_end);
            let decoration = { range };
            state.diffAdd.push(decoration);
            // let cut = doc.getText().substring(st, ed);
        }
    });

    let dremove = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(108,22,22,1)',
        color: 'white',
        isWholeLine: true,
        before: {
            color: 'white',
            contentText: "-"
        },
        // opacity: '0.2'
    });

    let dadd = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(75,86,51,1)',
        color: 'white',
        isWholeLine: true,
        before: {
            color: 'white',
            contentText: "+"
        },

    });

    let blind = vscode.window.createTextEditorDecorationType({
        color: 'gray',
    });

    state.diffType.length = 0;
    state.diffType.push(blind);
    state.diffType.push(dremove);
    state.diffType.push(dadd);

    hideHighlight(editor);

    editor.setDecorations(dadd, state.diffAdd);
    editor.setDecorations(dremove, state.diffRemove);
    editor.setDecorations(blind, state.diffFull);

    let target = vscode.ConfigurationTarget.Global;
    let configuration = vscode.workspace.getConfiguration('indenticator');
    configuration.update('showIndentGuide', false, target);
    vscode.commands.executeCommand('setContext', 'codify.runTab', true);
}

function hideHighlight(editor: vscode.TextEditor)
{
    let state = getStateOfEditor(editor);
    for (let index = 0; index < state.highlights.length; index++) {
        const element = state.highlights[index];
        editor.setDecorations(element, []);
    }
    state.highlights.length = 0;
    // ranges.length = 0;
}

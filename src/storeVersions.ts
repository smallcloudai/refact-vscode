/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';


let fn2textlist = new Map<string, string[]>();
let fn2line = new Map<string, number>();
let fn2version = new Map<string, number>();
const N = 5;


function onChangeActiveEditor(editor: vscode.TextEditor | undefined)
{
    console.log(["onChangeActiveTextEditor", editor]);
}

function onChangeSelection(obj: vscode.TextEditorSelectionChangeEvent)
{
    // let folders = vscode.workspace.workspaceFolders;
    console.log(["onChangeSelection", obj]);
    let selections = obj.selections;
    let sel0 = selections[0];
    let line0 = sel0.start.line;
    let line1 = sel0.end.line;
    let version = obj.textEditor.document.version;
    let whole_doc = obj.textEditor.document.getText();
    // if line is the same, or version, or text => return
    console.log(["line", line0, line1, "version", version]);
    let fn = obj.textEditor.document.fileName;
    let versionlist = fn2textlist.get(fn);
    if (!versionlist) {
        versionlist = [];
        versionlist.push(whole_doc);
        fn2textlist.set(fn, versionlist);
        fn2line.set(fn, line0);
        fn2version.set(fn, version);
        return;
    }
    let last_version = fn2version.get(fn);
    if (last_version === version) {
        console.log(["same version", last_version, version]);
        return;
    }
    let last_line = fn2line.get(fn);
    if (last_line === line0) {
        console.log(["same line", last_line, line0]);
        return;
    }
    let last_text = versionlist[0];
    if (last_text === whole_doc) {
        console.log(["same text", last_text.length, whole_doc.length]);
        return;
    }
    versionlist.push(whole_doc);
    fn2line.set(fn, line0);
    fn2version.set(fn, version);
    if (versionlist.length > N) {
        versionlist.shift();
    }
    for (let i = 0; i < versionlist.length; i++) {
        console.log(["vlist[", i, "]", versionlist[i].length]);
    }
}

function onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent)
{
    // event.document.selections
    // console.log(["onDidChangeTextDocument", event]);
}

export function storeVersionsInit() {
    let disposable6 = vscode.window.onDidChangeActiveTextEditor(onChangeActiveEditor);
    let disposable7 = vscode.window.onDidChangeTextEditorSelection(onChangeSelection);
    let disposable8 = vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument);
    return [disposable6, disposable7, disposable8];
}

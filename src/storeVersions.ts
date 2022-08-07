/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';


let fn2textlist = new Map<string, string[]>();
let fn2versionlist = new Map<string, number[]>();
let fn2line = new Map<string, number>();
const N = 5;


export function fnGetRevisions(fn: string)
{
    let result: { [key: string]: string } = {};
    let textlist = fn2textlist.get(fn);
    if (!textlist) {
        return result;
    }
    let versionlist = fn2versionlist.get(fn);
    if (!versionlist) {
        return result;
    }
    for (let i = 0; i < textlist.length; i++) {
        let version = versionlist[i];
        let version_str = version.toString();
        result[fn + ":" + version_str] = textlist[i];
    }
    return result;
}

function fnReset(document: vscode.TextDocument, line0: number)
{
    let fn = document.fileName;
    let whole_doc = document.getText();
    let version = document.version;
    fn2textlist.set(fn, [whole_doc]);
    fn2versionlist.set(fn, [version]);
    fn2line.set(fn, line0);
}

function fnSaveChange(document: vscode.TextDocument, line0: number, force: boolean = false)
{
    let fn = document.fileName;
    let version = document.version;
    let textlist = fn2textlist.get(fn);
    if (!textlist) {
        fnReset(document, line0);
        return;
    }
    let versionlist = fn2versionlist.get(fn);
    if (!versionlist) {
        return;
    }
    let last_version = versionlist[versionlist.length - 1];
    if (last_version === version) {
        // console.log(["same version", last_version, version]);
        return;
    }
    let last_line = fn2line.get(fn);
    if (last_line === line0 && !force) {
        // console.log(["same line", last_line, line0]);
        return;
    }
    let whole_doc = document.getText();
    // let last_text = textlist[0];
    textlist.push(whole_doc);
    versionlist.push(version);
    fn2line.set(fn, line0);
    if (textlist.length > N) {
        textlist.shift();
        versionlist.shift();
    }
    for (let i = 0; i < textlist.length; i++) {
        console.log(["textlist", i, textlist[i].length, "version", versionlist[i]]);
    }
}

function onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent)
{
    let document = event.document;
    let contentChanges = event.contentChanges;
    let reason = event.reason;
    let line0 = contentChanges[0].range.start.line;
    if (reason === vscode.TextDocumentChangeReason.Redo) {
        fnReset(document, line0);
        return;
        // console.log(["onDidChangeTextDocument", "redo", v]);
    } else if (reason === vscode.TextDocumentChangeReason.Undo) {
        fnReset(document, line0);
        return;
        // console.log(["onDidChangeTextDocument", "undo", v]);
    } else {
        // console.log(["Keyboard"]);
    }
    let line_min = 1000000;
    let line_max = -1;
    for (let change of contentChanges) {
        // console.log([
        //     "change", change.text.length,
        //     "start", change.range.start.line, change.range.start.character,
        //     "end", change.range.end.line, change.range.end.character,
        // ]);
        line_min = Math.min(line_min, change.range.start.line);
        line_max = Math.max(line_max, change.range.end.line);
    }
    let force = line_min !== line_max;
    fnSaveChange(document, line0, force);
}

export function storeVersionsInit() {
    // let disposable6 = vscode.window.onDidChangeActiveTextEditor(onChangeActiveEditor);
    let disposable8 = vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument);
    // return [disposable6, disposable7, disposable8];
    return [disposable8];
}

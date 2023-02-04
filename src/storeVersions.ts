/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as estate from './estate';


let fn2textlist = new Map<string, string[]>();
let fn2versionlist = new Map<string, number[]>();
let fn2line = new Map<string, number>();
const N = 5;


export function filename_from_document(document: vscode.TextDocument): string
{
    let file_name = document.fileName;
    let project_dir = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
    if (project_dir !== undefined && file_name.startsWith(project_dir)) {
        // This prevents unnecessary user name and directory details from leaking
        let relative_file_name = file_name.substring(project_dir.length);
        if (relative_file_name.startsWith("/")) {
            relative_file_name = relative_file_name.substring(1);
        }
        return relative_file_name;
    }
    // As a fallback, return the full file name without any directory
    let last_slash = file_name.lastIndexOf("/");
    if (last_slash >= 0) {
        return file_name.substring(last_slash+1);
    }
    return file_name;
}


export function get_revisions_for_file(fn: string)
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
    for (let i = textlist.length - 1; i >= 0; i--) {
        let version = versionlist[i];
        let version_str = version.toString();
        result[fn + ":" + version_str] = textlist[i];
    }
    return result;
}


function reset_file_state_to_one_current_version(document: vscode.TextDocument, line0: number)
{
    let fn = filename_from_document(document);
    let whole_doc = document.getText();
    let version = document.version;
    fn2textlist.set(fn, [whole_doc]);
    fn2versionlist.set(fn, [version]);
    fn2line.set(fn, line0);
    console.log(["fnReset", fn, "version", version, "line0", line0]);
}


function _save_change(document: vscode.TextDocument, line0: number, force: boolean = false)
{
    let state = estate.state_of_document(document);
    if (state) {
        if (state.get_mode() !== estate.Mode.Normal) {
            return;
        }
    }
    let fn = filename_from_document(document);
    let version = document.version;
    let textlist = fn2textlist.get(fn);
    if (!textlist) {
        reset_file_state_to_one_current_version(document, line0);
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
        console.log(["same line", last_line, line0]);
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
    // for (let i = 0; i < textlist.length; i++) {
    //     console.log(["textlist", i, textlist[i].length, "version", versionlist[i]]);
    // }
}


function onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent)
{
    let document = event.document;
    if (!estate.is_lang_enabled(document)) {
        reset_file_state_to_one_current_version(document, 0);
        return;
    }
    let contentChanges = event.contentChanges;
    let reason = event.reason;
    if(contentChanges.length === 0) { return; };
    let line0 = contentChanges[0].range.start.line;
    if (reason === vscode.TextDocumentChangeReason.Redo) {
        // reset_file_state_to_one_current_version(document, line0);
        return;
        // console.log(["onDidChangeTextDocument", "redo", v]);
    } else if (reason === vscode.TextDocumentChangeReason.Undo) {
        // reset_file_state_to_one_current_version(document, line0);
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
    _save_change(document, line0, force);
}


function onChangeActiveEditor(editor: vscode.TextEditor | undefined)
{
    if (!editor) {
        return;
    }
    let document = editor.document;
    let line0 = editor.selection.start.line;
    if (!estate.is_lang_enabled(document)) {
        reset_file_state_to_one_current_version(document, 0);
        return;
    }
    console.log(["onChangeActiveEditor"]);
    _save_change(document, line0);
}


export function store_versions_init()
{
    let disposable6 = vscode.window.onDidChangeActiveTextEditor(onChangeActiveEditor);
    let disposable8 = vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument);
    let editor = vscode.window.activeTextEditor;
    if (editor) {
        onChangeActiveEditor(editor);
    }
    return [disposable6, disposable8];
}

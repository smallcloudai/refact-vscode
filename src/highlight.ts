/* eslint-disable @typescript-eslint/naming-convention */
import { clear } from "console";
import internal = require("stream");
import * as vscode from 'vscode';
import * as fetch from "./fetchAPI";
import * as interactiveDiff from "./interactiveDiff";


// let highlightEsc: boolean = false;

let highlightJson: any = [];
// highlight arrays
let highlights: any = [];
let ranges: any = [];

let changeEvent: any = [];

let originalCode: string;

let diffType: any = [];
let diffAdd: any = [];
let diffRemove: any = [];
let diffFull: any = [];
let diffCode: string;

let diffFetching: boolean = false;

enum Mode {
    Highlight,
    Diff,
    Accept
}
let currentMode = Mode.Highlight;

const activeEditor = vscode.window.activeTextEditor;

export async function runHighlight(context: vscode.ExtensionContext)
{
    let document = activeEditor!.document;
    let curPos = activeEditor!.selection.active;
    let cursor = document.offsetAt(curPos);

    let file_name = document.fileName;
    let sources: { [key: string]: string } = {};
    let whole_doc = document.getText();
    originalCode = whole_doc;
    sources[file_name] = whole_doc;
    let max_tokens = 0;
    let cancellationTokenSource = new vscode.CancellationTokenSource();
    let cancelToken = cancellationTokenSource.token;

    await fetch.waitAllRequests();

    // let cancelToken = ;

    let request = new fetch.PendingRequest(undefined, cancelToken);
    let stop_tokens: string[] = [];

    request.supplyStream(fetch.fetchAPI(
        cancelToken,
        sources,
        "Fix",
        "highlight",
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

    highlightJson = json;
    showHighlight(json);
    // workspace.onDidChangeTextDocument(()=> {
    //     if(currentMode === 0) {
    //         for (let index = 0; index < highlights.length; index++) {
    //             const element = highlights[index];
    //             activeEditor?.setDecorations(element, []);
    //         }
    //         highlights.length = 0;
    //         ranges.length = 0;
    //     }
    // });

    // changeEvent = vscode.window.onDidChangeTextEditorSelection(()=> {
    //     let cPos = activeEditor!.selection.active;
    //     let cursor = document.offsetAt(cPos);

    //     for (let index = 0; index < ranges.length; index++) {
    //         const element = ranges[index];
    //         if(element.range.contains(cPos)) {
    //             getDiff(cursor);
    //         }
    //     }
    // });
    vscode.commands.executeCommand('setContext', 'codify.runEsc', true);
}

export function showHighlight(json: any = []) {
    let document = activeEditor!.document;
    for (let index = 0; index < json.highlight.length; index++) {
        const element = json.highlight[index];
        if(currentMode === Mode.Highlight) {
            const start = document.positionAt(element[0]);
            const end = document.positionAt(element[1]);
            let range = new vscode.Range(
                start,
                end
            );

            let decoration = { range };

            let ranger: any = [];
            ranger.push(decoration);
            ranges.push(decoration);

            let deco = vscode.window.createTextEditorDecorationType({
                backgroundColor: 'rgba(255, 240, 0, ' + element[2] + ')',
                color: 'black'
            });

            highlights.push(deco);
            activeEditor?.setDecorations(deco, ranger);
        }
        if(currentMode === Mode.Diff) {

            let deco = vscode.window.createTextEditorDecorationType({
                backgroundColor: 'rgba(255, 240, 0, ' + element[2] + ')',
                color: 'black'
            });
            highlights.push(deco);
            activeEditor?.setDecorations(deco, [ranges[index]]);
        }

    }
}

export async function getDiff(cursor: number)
{
    if(diffFetching === true) {
        return;
    }
    diffFetching = true;
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    let document = editor.document;
    let file_name = document.fileName;
    let sources: { [key: string]: string } = {};
    let whole_doc = document.getText();
    sources[file_name] = whole_doc;
    let max_tokens = 50;
    let stop_tokens: string[] = [];

    let cancellationTokenSource = new vscode.CancellationTokenSource();
    let cancelToken = cancellationTokenSource.token;

    let promise = fetch.fetchAPI(
        cancelToken,
        sources,
        "Fix",
        "diff-atcursor",
        file_name,
        cursor,
        cursor,
        max_tokens,
        1,
        stop_tokens,
    );

    let json;
    try {
        const result = await promise;
        json = await result.json();
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.log(err.message);
        }
        return { items: [] };
    }
    console.log('diff',json);
    let modif_doc = json["choices"][0]["files"][file_name];
    diffCode = modif_doc;
    interactiveDiff.offerDiff(editor, modif_doc);
}


export function clearHighlight()
{
    if(currentMode === Mode.Highlight) {
        if(diffType.length > 0) {
            for (let index = 0; index < diffType.length; index++) {
                const element = diffType[index];
                activeEditor?.setDecorations(element, []);
            }
            diffType.length = 0;
            diffAdd.length = 0;
            diffRemove.length = 0;
            diffFull.length = 0;
        }

        for (let index = 0; index < highlights.length; index++) {
            const element = highlights[index];
            activeEditor?.setDecorations(element, []);
        }
        highlights.length = 0;
        ranges.length = 0;

        vscode.commands.executeCommand('setContext', 'codify.runEsc', false);
        changeEvent.dispose();
    }

    if(currentMode === Mode.Diff) {

        for (let index = 0; index < diffType.length; index++) {
            const element = diffType[index];
            activeEditor?.setDecorations(element, []);
        }
        diffType.length = 0;
        diffAdd.length = 0;
        diffRemove.length = 0;
        diffFull.length = 0;

        let firstLine = activeEditor?.document.lineAt(0);
        let lastLine = activeEditor?.document.lineAt(activeEditor?.document.lineCount - 1);
        let textRange = new vscode.Range(0,firstLine!.range.start.character,activeEditor!.document.lineCount - 1,lastLine!.range.end.character);
        activeEditor?.edit((selectedText) => {
            selectedText.replace(textRange, originalCode);
        });

        showHighlight(highlightJson);
        currentMode = Mode.Highlight;
    }
    if(currentMode === Mode.Accept) {
        for (let index = 0; index < diffType.length; index++) {
            const element = diffType[index];
            activeEditor?.setDecorations(element, []);
        }
        diffType.length = 0;
        diffAdd.length = 0;
        diffRemove.length = 0;
        diffFull.length = 0;

        for (let index = 0; index < highlights.length; index++) {
            const element = highlights[index];
            activeEditor?.setDecorations(element, []);
        }
        highlights.length = 0;
        ranges.length = 0;
        currentMode = Mode.Highlight;
    }
    vscode.commands.executeCommand('setContext', 'codify.runTab', false);
    let target = vscode.ConfigurationTarget.Global;
    let configuration = vscode.workspace.getConfiguration('indenticator');
    configuration.update('showIndentGuide', true, target);
}

export function accept()
{
    let firstLine = activeEditor?.document.lineAt(0);
    let lastLine = activeEditor?.document.lineAt(activeEditor?.document.lineCount - 1);
    let textRange = new vscode.Range(0,firstLine!.range.start.character,activeEditor!.document.lineCount - 1,lastLine!.range.end.character);
    activeEditor?.edit((selectedText) => {
        selectedText.replace(textRange, diffCode);
    });
    currentMode = Mode.Accept;
    clearHighlight();
    vscode.commands.executeCommand('setContext', 'codify.runEsc', false);
    vscode.commands.executeCommand('setContext', 'codify.runTab', false);
    changeEvent.dispose();
}


// vscode.window.onDidChangeActiveTextEditor(editor => {
//     activeEditor = editor;
//     if (editor) {
//         triggerUpdateDecorations();
//     }
// }, null, context.subscriptions);

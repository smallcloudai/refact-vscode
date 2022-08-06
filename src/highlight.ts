/* eslint-disable @typescript-eslint/naming-convention */
import { clear } from "console";
import internal = require("stream");
import {
    Position,
    TextDocument,
    TextEditor,
    Range,
    Command,
    window,
    languages,
    commands,
    workspace,
    DecorationOptions,
    OverviewRulerLane,
    TextEditorDecorationType,
    DiagnosticCollection,
    ExtensionContext,
    ConfigurationTarget
} from "vscode";

import {fetchAPI} from "./fetchAPI";
const Diff = require('diff');

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
let currentMode: number = 0;

const activeEditor = window.activeTextEditor;

export async function runHighlight(context: ExtensionContext) {

    let document = activeEditor!.document;
    let curPos = activeEditor!.selection.active;
    let cursor = document.offsetAt(curPos);

    console.log('cursor position', cursor);

    let file_name = document.fileName;
    let sources: { [key: string]: string } = {};
    let whole_doc = document.getText();
    originalCode = whole_doc;
    sources[file_name] = whole_doc;
    let max_tokens = 0;

    let promise = fetchAPI(
        sources,
        "Fix",
        "highlight",
        file_name,
        cursor,
        cursor,
        max_tokens,
        1
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

    console.log(json);

    highlightJson = json;

    getHighlight(json); 

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

    changeEvent = window.onDidChangeTextEditorSelection(()=> {
        let cPos = activeEditor!.selection.active;
        let cursor = document.offsetAt(cPos);

        for (let index = 0; index < ranges.length; index++) {
            const element = ranges[index];
            if(element.range.contains(cPos)) {
                getDiff(cursor);
            }
        }
    });
    commands.executeCommand('setContext', 'vscode-mate.runEsc', true);
}

export function getHighlight(json: any = []) {
    let document = activeEditor!.document;
    for (let index = 0; index < json.highlight.length; index++) {
        const element = json.highlight[index];
        if(currentMode === 0) {
            const start = document.positionAt(element[0]);
            const end = document.positionAt(element[1]);
            let range = new Range(
                start,
                end
            );
    
            let decoration = { range };
            
            let ranger: any = [];
            ranger.push(decoration);
            ranges.push(decoration);
    
            let deco = window.createTextEditorDecorationType({
                backgroundColor: 'rgba(255, 240, 0, ' + element[2] + ')',
                color: 'black'
            });
    
            highlights.push(deco);
            activeEditor?.setDecorations(deco, ranger);
        }
        if(currentMode === 1) {
            
            let deco = window.createTextEditorDecorationType({
                backgroundColor: 'rgba(255, 240, 0, ' + element[2] + ')',
                color: 'black'
            });
            highlights.push(deco);
            activeEditor?.setDecorations(deco, [ranges[index]]);
        }

    }
}

export async function getDiff(cursor: number) {
    if(diffFetching === true) {
        return;
    }
    diffFetching = true;

    let document = activeEditor!.document;

    let file_name = document.fileName;
    let sources: { [key: string]: string } = {};
    let whole_doc = document.getText();
    sources[file_name] = whole_doc;
    let max_tokens = 50;

    let promise = fetchAPI(
        sources,
        "Fix",
        "diff-atcursor",
        file_name,
        cursor,
        cursor,
        max_tokens,
        1
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

    const diff = Diff.diffLines(whole_doc, modif_doc);
    currentMode = 1;
    let improved_doc = '';

    diff.forEach((part: any) => {
        let span = part.value;
        improved_doc += span;
    });

    let firstLine = activeEditor?.document.lineAt(0);
    let lastLine = activeEditor?.document.lineAt(activeEditor?.document.lineCount - 1);
    let textRange = new Range(0,firstLine!.range.start.character,activeEditor!.document.lineCount - 1,lastLine!.range.end.character);

    activeEditor?.edit((selectedText) => {
        selectedText.replace(textRange, improved_doc);
    }).then(() => {
        makeDiffLines(activeEditor!.document, diff, textRange);
    });
}

function hideHighlight() {
    for (let index = 0; index < highlights.length; index++) {
        const element = highlights[index];
        activeEditor?.setDecorations(element, []);
    }
    highlights.length = 0;
    // ranges.length = 0;
}


export function makeDiffLines(doc: any, diff: any, rng: any) {
    diffFetching = false;

    let range = rng;
    let decoration = { range };
    diffFull.push(decoration);

    diff.forEach((part: any) => {

        if(part.removed) {
            let st = doc.getText().indexOf(part.value);
            let ed = st + part.value.length;
            let pos_start = doc.positionAt(st);
            let pos_end = doc.positionAt(ed);
            let range = new Range(pos_start,pos_end);
            let decoration = { range };
            diffRemove.push(decoration);

        }
        if(part.added) {

            let st = doc.getText().indexOf(part.value);
            let ed = st + part.value.length;

            let pos_start = doc.positionAt(st);
            let pos_end = doc.positionAt(ed - 1);

            let range = new Range(pos_start,pos_end);
            let decoration = { range };
            diffAdd.push(decoration);
            // let cut = doc.getText().substring(st, ed);
        }
    });

    let dremove = window.createTextEditorDecorationType({
        backgroundColor: 'rgba(108,22,22,1)',
        color: 'white',
        isWholeLine: true,
        before: {
            color: 'white',
            contentText: "-"
        },
        // opacity: '0.2'
    });

    let dadd = window.createTextEditorDecorationType({
        backgroundColor: 'rgba(75,86,51,1)',
        color: 'white',
        isWholeLine: true,
        before: {
            color: 'white',
            contentText: "+"
        },

    });

    let blind = window.createTextEditorDecorationType({
        color: 'gray',
    });

    diffType.length = 0;
    diffType.push(blind);
    diffType.push(dremove);
    diffType.push(dadd);

    hideHighlight();

    activeEditor?.setDecorations(dadd, diffAdd);
    activeEditor?.setDecorations(dremove, diffRemove);
    activeEditor?.setDecorations(blind, diffFull);

    let target = ConfigurationTarget.Global;
    let configuration = workspace.getConfiguration('indenticator');
    configuration.update('showIndentGuide', false, target);
    commands.executeCommand('setContext', 'vscode-mate.runTab', true);
}

export function clearHighlight() {
    if(currentMode === 0) {
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

        commands.executeCommand('setContext', 'vscode-mate.runEsc', false);
        changeEvent.dispose();
    }

    if(currentMode === 1) {
        
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
        let textRange = new Range(0,firstLine!.range.start.character,activeEditor!.document.lineCount - 1,lastLine!.range.end.character);
        activeEditor?.edit((selectedText) => {
            selectedText.replace(textRange, originalCode);
        });

        getHighlight(highlightJson);
        currentMode = 0;
    }
    if(currentMode === 2) {
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
        currentMode = 0;
    }
    commands.executeCommand('setContext', 'vscode-mate.runTab', false);
    let target = ConfigurationTarget.Global;
    let configuration = workspace.getConfiguration('indenticator');
    configuration.update('showIndentGuide', true, target);
}

export function accept() {
    let firstLine = activeEditor?.document.lineAt(0);
    let lastLine = activeEditor?.document.lineAt(activeEditor?.document.lineCount - 1);
    let textRange = new Range(0,firstLine!.range.start.character,activeEditor!.document.lineCount - 1,lastLine!.range.end.character);
    activeEditor?.edit((selectedText) => {
        selectedText.replace(textRange, diffCode);
    });
    currentMode = 2;
    clearHighlight();
    commands.executeCommand('setContext', 'vscode-mate.runEsc', false);
    commands.executeCommand('setContext', 'vscode-mate.runTab', false);
    changeEvent.dispose();
}


// vscode.window.onDidChangeActiveTextEditor(editor => {
//     activeEditor = editor;
//     if (editor) {
//         triggerUpdateDecorations();
//     }
// }, null, context.subscriptions);
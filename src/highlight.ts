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

// highlight arrays
let highlightType: any = [];
let highlightArray: any = [];
let originalCode: string;

let diffType: any = [];
let diffAdd: any = [];
let diffRemove: any = [];
let diffFull: any = [];
let diffCode: string;

let diffFetching: boolean = false;
let currentMode: number = 0;

export async function getHighlight(context: ExtensionContext) {
    clearHighlight();

    let activeEditor = window.activeTextEditor;
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

    for (let index = 0; index < json.highlight.length; index++) {
        const element = json.highlight[index];
        const start = document.positionAt(element[0]);
        const end = document.positionAt(element[1]);
        let range = new Range(
            start,
            end
        );

        let decoration = { range };
        highlightArray.push(decoration);

        let dt = window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 240, 0, ' + element[2] + ')',
            color: 'black'
        });

        highlightType.push(dt);

        activeEditor?.setDecorations(dt, highlightArray);

        workspace.onDidChangeTextDocument(()=> {
            for (let index = 0; index < highlightType.length; index++) {
                const element = highlightType[index];
                element.dispose();
            }
            highlightArray.length = 0;
            highlightType.length = 0;
        });

    }
    window.onDidChangeTextEditorSelection(()=> {
        let cPos = activeEditor!.selection.active;
        let cursor = document.offsetAt(cPos);

        for (let index = 0; index < highlightArray.length; index++) {
            const element = highlightArray[index];
            if(element.range.contains(cPos)) {
                getDiff(cursor);
            }
        }
    });
    commands.executeCommand('setContext', 'vscode-mate.runEsc', true);
}

export async function clearHighlight(): Promise<void> {
    let activeEditor = window.activeTextEditor;

    if(currentMode === 0) {
        for (let index = 0; index < highlightType.length; index++) {
            const element = highlightType[index];
            element.dispose();
        }
        highlightArray.length = 0;
        highlightType.length = 0;

        commands.executeCommand('setContext', 'vscode-mate.runEsc', false);
    }
    if(currentMode === 1) {
        for (let index = 0; index < diffType.length; index++) {
            const element = diffType[index];
            console.log('element ' + index, element);
        }
        let firstLine = activeEditor?.document.lineAt(0);
        let lastLine = activeEditor?.document.lineAt(activeEditor?.document.lineCount - 1);
        let textRange = new Range(0,firstLine!.range.start.character,activeEditor!.document.lineCount - 1,lastLine!.range.end.character);
        activeEditor?.edit((selectedText) => {
            selectedText.replace(textRange, originalCode);
        });

        for (let index = 0; index < diffType.length; index++) {
            const element = diffType[index];
            element.dispose();
        }
        currentMode = 0;
        console.log('highlightType',highlightType);
        activeEditor?.setDecorations(highlightType[0], highlightArray);
        diffAdd.length = 0;
        diffRemove.length = 0;
        diffFull.length = 0;
        diffType.length = 0;
        commands.executeCommand('setContext', 'vscode-mate.runEsc', false);
    }

}

export async function accept() {
    let activeEditor = window.activeTextEditor;
    let firstLine = activeEditor?.document.lineAt(0);
    let lastLine = activeEditor?.document.lineAt(activeEditor?.document.lineCount - 1);
    let textRange = new Range(0,firstLine!.range.start.character,activeEditor!.document.lineCount - 1,lastLine!.range.end.character);
    activeEditor?.edit((selectedText) => {
        selectedText.replace(textRange, diffCode);
    });
    clearHighlight();
    commands.executeCommand('setContext', 'vscode-mate.runEsc', false);
    commands.executeCommand('setContext', 'vscode-mate.runTab', false);

    // for (let index = 0; index < decorationType.length; index++) {
    //     const element = decorationType[index];
    //     element.dispose();
    // }
    // decorationsArray.length = 0;
    // decorationType.length = 0;
}

export async function getDiff(cursor: number) {
    if(diffFetching === true) {
        return;
    }
    diffFetching = true;

    let activeEditor = window.activeTextEditor;
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
    clearHighlight();
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
        makeHighlight(activeEditor!.document, diff, textRange);
    });
}

export function makeHighlight(dox: any, diff: any, rng: any) {
    diffFetching = false;
    let activeEditor = window.activeTextEditor;

    let doc = dox;

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

    activeEditor?.setDecorations(dadd, diffAdd);
    activeEditor?.setDecorations(dremove, diffRemove);
    activeEditor?.setDecorations(blind, diffFull);

    let target = ConfigurationTarget.Global;
    let configuration = workspace.getConfiguration('indenticator');
    // console.log('configuration',configuration);
    configuration.update('showIndentGuide', false, target);

    commands.executeCommand('setContext', 'vscode-mate.runEsc', true);
    commands.executeCommand('setContext', 'vscode-mate.runTab', true);
}

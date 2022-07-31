/* eslint-disable @typescript-eslint/naming-convention */
import { clear } from "console";
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
    HoverProvider,
    Hover,
    ExtensionContext,
    Uri,
    QuickDiffProvider
} from "vscode";

import {fetchAPI} from "./fetchAPI";
const Diff = require('diff');

let decorationType: any = [];
let decorationsArray: DecorationOptions[] = [];
let diffFetching: boolean = false;

export async function getHighlight(context: ExtensionContext) {
    clearDecorations();
    let activeEditor = window.activeTextEditor;
    let document = activeEditor!.document;
    let curPos = activeEditor!.selection.active;
    let cursor = document.offsetAt(curPos);

    console.log('cursor position', cursor);

    let file_name = document.fileName;
    let sources: { [key: string]: string } = {};
    let whole_doc = document.getText();
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

    // console.log(json);
    
    for (let index = 0; index < json.highlight.length; index++) {
       
        const element = json.highlight[index];
        const start = document.positionAt(element[0]);
        const end = document.positionAt(element[1]);
        let range = new Range(
            start,
            end
        );

        let decoration = { range };
        decorationsArray.push(decoration);

        let dt = window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 240, 0, ' + element[2] + ')',
            color: 'black'
            // opacity: '0.2'
        });

        decorationType.push(dt);
        
        activeEditor?.setDecorations(dt, decorationsArray);
        // console.log('dt',dt);
        // console.log('decorationsArray',decorationsArray);

        workspace.onDidChangeTextDocument(()=> {
            for (let index = 0; index < decorationType.length; index++) {
                const element = decorationType[index];
                element.dispose();
            }
            decorationsArray.length = 0;
            decorationType.length = 0;
        });
   
    }
    window.onDidChangeTextEditorSelection(()=> {
        let cPos = activeEditor!.selection.active;
        let cursor = document.offsetAt(cPos);
        // console.log('cursor',cursor);
        // console.log('decorationsArray',decorationsArray);
        for (let index = 0; index < decorationsArray.length; index++) {
            const element = decorationsArray[index];
            if(element.range.contains(cPos)) {
                getDiff(cursor);
            }
        }
    });
}

export async function clearDecorations() {
    for (let index = 0; index < decorationType.length; index++) {
        const element = decorationType[index];
        element.dispose();
    }
    decorationsArray.length = 0;
    decorationType.length = 0;
}

// memoryfile.register_memoryFileProvider(ExtensionContext);
export async function getDiff(cursor: number) {
    clearDecorations();
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
    clearDecorations();
    // console.log('diff',json);
    let modif_doc = json["choices"][0]["files"][file_name];

    // Make Hidden Files
    // console.log('whole_uri',Uri.file(whole_doc));
    // workspace.openTextDocument({
    //     content: modif_doc, 
    //     language: "text"
    // });
    // let memfile = memoryfile.MemoryFile.createDocument("python");
    // memfile.write(modif_doc);
    // let doc = workspace.openTextDocument(memfile.getUri());
    // console.log('memfile',memfile.r);
    // commands.executeCommand("vscode.diff", document.uri, memfile.uri);


    // let conf = workspace.getConfiguration('vscode-mate');
    // console.log('config',conf);

    const diff = Diff.diffLines(whole_doc, modif_doc);
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
    });
        
    // console.log('improved_doc',improved_doc);
    // console.log('diff',diff);

    let linesAdd: any = [];
    let linesRemove: any = [];

    diff.forEach((part: any) => {                
        // const color = part.added ? 'green' : part.removed ? 'red' : 'gray';
        // lines.push('<span class="diffline-' + color + '">' + part.value + '</span>');
        if(part.removed) {
            let st = improved_doc.indexOf(part.value);
            let ed = st + part.value.length;
            let pos_start = document.positionAt(st);
            let pos_end = document.positionAt(ed);
            let range = new Range(pos_start,pos_end);
            let decoration = { range };
            linesRemove.push(decoration);
            // let cut = improved_doc.substring(st, ed);
            // console.log('cut remove',cut);

            // let r_start = aceEditor.session.doc.indexToPosition(start);
            // let r_end = aceEditor.session.doc.indexToPosition(end);
            // let range = new Range(r_start.row,r_start.column, r_end.row, r_end.column);
            // let marker = aceEditor.getSession().addMarker(range,"marker-remove", "line");
            // console.log('marker',marker)
        }
        if(part.added) {
            let st = improved_doc.indexOf(part.value);
            let ed = st + part.value.length;
            console.log('st',st);
            console.log('ed',ed);
            let pos_start = document.positionAt(st);
            let pos_end = document.positionAt(ed);
            let range = new Range(pos_start,pos_end);
            let decoration = { range };
            linesAdd.push(decoration);
            // let cut = improved_doc.substring(st, ed);
            // console.log('cut add',cut);
        }
    });

    let dremove = window.createTextEditorDecorationType({
        backgroundColor: 'rgba(108,22,22,1)',
        // color: 'white',
        isWholeLine: true,
        before: {
            color: 'white',
            contentText: "-"
        },
        // opacity: '0.2'
    });

    let dadd = window.createTextEditorDecorationType({
        backgroundColor: 'rgba(75,86,51,1)',
        // color: 'white',
        isWholeLine: true,
        before: {
            color: 'white',
            contentText: "+"
        },
        
    });

    activeEditor?.setDecorations(dadd, linesAdd);
    activeEditor?.setDecorations(dremove, linesRemove);

    // console.log('linesAdd',linesAdd);
    // console.log('linesRemove',linesRemove);
}
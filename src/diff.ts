const diff = require('diff');  // Documentation: https://github.com/kpdecker/jsdiff/
import * as vscode from 'vscode';

/**
 * Diff between two strings returns merged text 
 * @param original 
 * @param modified 
 */
export function diffStringsToText(
    original: string,
    modified: string
) {
    const compare = diff.diffLines(original, modified);
    let improved = '';

    diff.forEach((part: any) => {
        let span = part.value;
        improved += span;
    });

    return improved;
}

/**
 * Diff between two strings returns array 
 * @param original 
 * @param modified 
 */
 export function diffStringsToArray(
    original: string,
    modified: string
) {
    return diff.diffLines(original, modified);
}

/**
 * Array of ranges needed to be hightlighted in the editor
 * @param document - VS Code Document
 * @param diffs - Diffs Array
 */
export function getHighlightRanges(
    document: any,
    diffs: any
) {
    let result: any = {
        added: [],
        removed: [],
    };
    let added: any = [];
    let removed: any = [];
    diffs.forEach((element: any) => {
        if(element.removed) {
            let start = document.getText().indexOf(element.value);
            let end = start + element.value.length;
            let posStart = document.positionAt(start);
            let posEnd = document.positionAt(end);
            let range = new vscode.Range(posStart,posEnd);
            removed.push({range});
        }
        if(element.added) {
            let start = document.getText().indexOf(element.value);
            let end = start + element.value.length;
            let posStart = document.positionAt(start);
            let posEnd = document.positionAt(end);
            let range = new vscode.Range(posStart,posEnd);
            added.push({range});
        }
    });
    result.added.push(added);
    result.removed.push(removed);
    return result;
}

/**
 * Create decorations in editor by ranges
 * @param editor 
 * @param ranges 
 * @returns array of decorations
 */
export function addDecorations(
    editor: any,
    ranges: any
) {
    let decorations: any = [];
    let remove = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(108,22,22,1)',
        color: 'white',
        isWholeLine: true,
        before: {
            color: 'white',
            contentText: "-"
        },
    });
    let add = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(75,86,51,1)',
        color: 'white',
        isWholeLine: true,
        before: {
            color: 'white',
            contentText: "+"
        },
    });
    decorations.push(remove);
    decorations.push(add);

    editor.setDecorations(add, ranges.added);
    editor.setDecorations(remove, ranges.removed);

    return decorations;
}

/**
 * Remove decorations in editor
 * @param editor 
 * @param decorations array of decorations
 */
export function removeDecorations(
    editor: any,
    decorations: any
) {
    decorations.forEach((element: any) => {
        editor.setDecorations(element, []);
    });

}

// Add commands
// vscode.commands.executeCommand('setContext', 'vscode-mate.runTab', true);
// vscode.commands.executeCommand('setContext', 'vscode-mate.runEsc', true);

// Remove commands
// vscode.commands.executeCommand('setContext', 'vscode-mate.runTab', false);
// vscode.commands.executeCommand('setContext', 'vscode-mate.runEsc', false);

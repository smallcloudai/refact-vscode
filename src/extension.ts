// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {MyInlineCompletionProvider} from "./completionProvider";
import * as highlight from "./highlight";
import * as storeVersions from "./storeVersions";


export function activate(context: vscode.ExtensionContext)
{
	// let disposable2 = vscode.commands.registerCommand('plugin-vscode.inlineAccepted', () => {
	// 	console.log(["Accepted"]);
	// });

	// const comp = new MyInlineCompletionProvider();
	// vscode.languages.registerInlineCompletionItemProvider({pattern: "**"}, comp);

	let disposable3 = vscode.commands.registerCommand('plugin-vscode.f1', () => {
        highlight.runHighlight(context);
	});

    let disposable4 = vscode.commands.registerCommand('plugin-vscode.esc', () => {
        highlight.clearHighlight();
        // highlight.getHighlight(context);
		console.log(["ESC"]);
	});

    let disposable5 = vscode.commands.registerCommand('plugin-vscode.tab', () => {
        highlight.accept();
        // highlight.getHighlight(context);
		console.log(["TAB"]);
	});

	let disposables = storeVersions.storeVersionsInit();

	context.subscriptions.push(disposable3);
	context.subscriptions.push(disposable4);
	context.subscriptions.push(disposable5);
	context.subscriptions.push(...disposables);
}

export function deactivate()
{
}

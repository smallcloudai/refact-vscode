// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {MyInlineCompletionProvider} from "./completionProvider";
import * as highlight from "./highlight";
import * as storeVersions from "./storeVersions";
import StatusBarMenu from "./statusBar";
import LensProvider from "./codeLens";

export function activate(context: vscode.ExtensionContext)
{
	// let disposable2 = vscode.commands.registerCommand('plugin-vscode.inlineAccepted', () => {
	// 	console.log(["Accepted"]);
	// });

    const menu = new StatusBarMenu();
    menu.createStatusBarBlock(context);


    let docSelector = {
        scheme: "file"
    };
    
      // Register our CodeLens provider
    let codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
        docSelector,
        new LensProvider()
    );

    context.subscriptions.push(codeLensProviderDisposable);

	const comp = new MyInlineCompletionProvider();
	vscode.languages.registerInlineCompletionItemProvider({pattern: "**"}, comp);

	let disposable3 = vscode.commands.registerCommand('plugin-vscode.f1', () => {
        vscode.commands.executeCommand("workbench.action.quickOpen", ">Codify:");
        // highlight.runHighlight(context);
        console.log(["F1"]);
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

    let disposable6 = vscode.commands.registerCommand('plugin-vscode.menu1', () => {
        highlight.runHighlight(context);
        menu.statusbarLoading(true);
        // console.log(["Menu 1"]);
	});

    let disposable7 = vscode.commands.registerCommand('plugin-vscode.menu2', () => {
        console.log(["Menu 2"]);
	});

    let disposable8 = vscode.commands.registerCommand('plugin-vscode.menu0', () => {
        showInputBox();
        console.log(["Menu 0"]);
	});

	let disposables = storeVersions.storeVersionsInit();

	context.subscriptions.push(disposable3);
	context.subscriptions.push(disposable4);
	context.subscriptions.push(disposable5);
	context.subscriptions.push(disposable6);
	context.subscriptions.push(disposable7);
	context.subscriptions.push(disposable8);
	context.subscriptions.push(...disposables);

    async function showMessage() {
        vscode.window.showInformationMessage(`Hello World!`);
    }

    let commandDisposable = vscode.commands.registerCommand(
        'extension.showMessage',
        showMessage
    );
      
    context.subscriptions.push(commandDisposable);
}


export async function showInputBox() {
	const result = await vscode.window.showInputBox({
		value: 'Fix',
		valueSelection: [2, 4],
		placeHolder: 'For example: fedcba. But not: 123',
		validateInput: text => {
			vscode.window.showInformationMessage(`Validating: ${text}`);
			return text === '123' ? 'Not 123!' : null;
		}
	});
	vscode.window.showInformationMessage(`Got: ${result}`);
}

export function deactivate()
{
}

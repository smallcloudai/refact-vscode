/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import {MyInlineCompletionProvider} from "./completionProvider";
import * as highlight from "./highlight";
import * as storeVersions from "./storeVersions";
import StatusBarMenu from "./statusBar";
import LensProvider from "./codeLens";
import { runEditChaining } from "./editChaining";
import * as interactiveDiff from "./interactiveDiff";
import { Mode } from "./interactiveDiff";
import PanelWebview from "./panel";

export function activate(context: vscode.ExtensionContext)
{
    // let disposable2 = vscode.commands.registerCommand('plugin-vscode.inlineAccepted', () => {
    //     console.log(["Accepted"]);
    // });

    const menu = new StatusBarMenu();
    menu.createStatusBarBlock(context);


    let docSelector = {
        scheme: "file"
    };

    // Register our CodeLens provider
    // let codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
    //     docSelector,
    //     new LensProvider()
    // );

    // context.subscriptions.push(codeLensProviderDisposable);

    const comp = new MyInlineCompletionProvider();
    vscode.languages.registerInlineCompletionItemProvider({pattern: "**"}, comp);

    let disposable4 = vscode.commands.registerCommand('plugin-vscode.esc', () => {
		let editor = vscode.window.activeTextEditor;
		if (editor) {
			let state = interactiveDiff.getStateOfEditor(editor);
			if (state.mode === Mode.Diff) {
				interactiveDiff.rollback(editor);
			} else if (state.mode === Mode.Highlight) {
				highlight.backToNormal(editor);
			}
			if (state.mode === Mode.Normal) {
				vscode.commands.executeCommand('setContext', 'codify.runEsc', false);
				console.log(["ESC OFF"]);
			}
		}
    });

    let disposable5 = vscode.commands.registerCommand('plugin-vscode.tab', () => {
        // highlight.accept();
        console.log(["TAB"]);
		let editor = vscode.window.activeTextEditor;
		if (editor) {
			let state = interactiveDiff.getStateOfEditor(editor);
			if (state.mode === Mode.Diff) {
				interactiveDiff.accept(editor);
			}
		}
    });

    let disposable3 = vscode.commands.registerCommand('plugin-vscode.highlight', () => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        let state = interactiveDiff.getStateOfEditor(editor);
        if (state.mode === Mode.Diff) {
            rollback_and_regen(editor);
        } else {
            askIntent();
        }
        // vscode.commands.executeCommand("workbench.action.quickOpen", ">Codify:");
    });

	let disposable8 = vscode.commands.registerCommand('plugin-vscode.editChaining', () => {
        runEditChaining();
    });

    // let disposable6 = vscode.commands.registerCommand('plugin-vscode.highlight', () => {
    //     // menu.statusbarLoading(true);
    //     // console.log(["Menu 1"]);
    // });

    // let disposable7 = vscode.commands.registerCommand('plugin-vscode.editChaining', () => {
    //     // highlight.runHighlight(context);
    // });

    let disposables = storeVersions.storeVersionsInit();

    context.subscriptions.push(disposable3);
    context.subscriptions.push(disposable4);
    context.subscriptions.push(disposable5);
    // context.subscriptions.push(disposable6);
    // context.subscriptions.push(disposable7);
    context.subscriptions.push(disposable8);
    context.subscriptions.push(...disposables);


    const PanelWebViewProvider = new PanelWebview(context?.extensionUri);
	let view = vscode.window.registerWebviewViewProvider(
		'codify-presets',
		PanelWebViewProvider,
	);
	context.subscriptions.push(view);
    console.log('inputbox',vscode.window.showInputBox);
}


export async function rollback_and_regen(editor: vscode.TextEditor)
{
    await interactiveDiff.rollback(editor);
    interactiveDiff.regen(editor);
}


export async function askIntent()
{
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
    let selection = editor.selection;
    let selection_empty = selection.isEmpty;
    const intent = await vscode.window.showInputBox({
        title: (selection_empty ? "What would you like to do? (this action highlights code first)" : "What would you like to do with the selected code?"),
        value: highlight.global_intent,
        valueSelection: [0, 80],
        placeHolder: 'Convert to list comprehension',
    });
    if (selection_empty) {
        if (intent) {
            highlight.runHighlight(editor, intent);
        }
    } else {
        if (intent) {
            highlight.saveIntent(intent);
            editor.selection = new vscode.Selection(selection.start, selection.start);
            interactiveDiff.queryDiff(editor, selection);
        }
    }
    // vscode.window.showInformationMessage(`Got: ${result}`);
}

export function deactivate()
{
}

/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import {MyInlineCompletionProvider} from "./completionProvider";
import * as highlight from "./highlight";
import * as storeVersions from "./storeVersions";
import StatusBarMenu from "./statusBar";
import LensProvider from "./codeLens";
import * as editChaining from "./editChaining";
import * as interactiveDiff from "./interactiveDiff";
import { Mode } from "./interactiveDiff";
import PanelWebview from "./panel";
import SettingsPage from "./settings";


declare global {
    var menu: any;
    var panelProvider: any;
    var settingsPage: any;
}


export async function acceptEditChain(document: vscode.TextDocument, pos: vscode.Position)
{
    let state1 = interactiveDiff.getStateOfDocument(document);
    console.log(["Accepted", pos.line, pos.character]);
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    let state2 = interactiveDiff.getStateOfEditor(editor);
    if (state1 !== state2) {
        return;
    }
    let next_line_pos = new vscode.Position(pos.line + 1, 0);
    let next_next_line_pos = new vscode.Position(pos.line + 2, 0);
    await editor.edit((e) => {
        e.delete(new vscode.Range(next_line_pos, next_next_line_pos));
    }, { undoStopBefore: false, undoStopAfter: false }).then(() => {
        if (editor) {
            interactiveDiff.showEditChainDiff(editor);
            highlight.setupKeyboardReactions(editor);
        }
    });
}


export function activate(context: vscode.ExtensionContext)
{
    let disposable2 = vscode.commands.registerCommand('plugin-vscode.inlineAccepted', acceptEditChain);
    global.menu = new StatusBarMenu();
    global.menu.createStatusBarBlock(context);

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
    });

	// let disposable8 = vscode.commands.registerCommand('plugin-vscode.editChaining', () => {
    //     runEditChaining();
    // });

    let disposables = storeVersions.storeVersionsInit();

    context.subscriptions.push(disposable3);
    context.subscriptions.push(disposable4);
    context.subscriptions.push(disposable5);
    context.subscriptions.push(disposable2);
    context.subscriptions.push(...disposables);


    global.panelProvider = new PanelWebview(context?.extensionUri);
	let view = vscode.window.registerWebviewViewProvider(
		'codify-presets',
		global.panelProvider,
	);
	context.subscriptions.push(view);


    let settingsCommand = vscode.commands.registerCommand('plugin-vscode.openSettings', () => {
        SettingsPage.render(context.extensionUri);
    });
    context.subscriptions.push(settingsCommand);
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
    // global.panelProvider.updateQuery(intent);
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

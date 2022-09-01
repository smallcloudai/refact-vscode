/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import {MyInlineCompletionProvider} from "./completionProvider";
import * as highlight from "./highlight";
import * as storeVersions from "./storeVersions";
import StatusBarMenu from "./statusBar";
import LensProvider from "./codeLens";
import * as editChaining from "./editChaining";
import * as interactiveDiff from "./interactiveDiff";
import * as estate from "./estate";
import * as fetch from "./fetchAPI";
import { Mode } from "./estate";
import PanelWebview from "./panel";
import SettingsPage from "./settings";


declare global {
    var menu: any;
    var panelProvider: any;
    var settingsPage: any;
}


export function activate(context: vscode.ExtensionContext)
{
    let disposable2 = vscode.commands.registerCommand('plugin-vscode.inlineAccepted', editChaining.acceptEditChain);
    global.menu = new StatusBarMenu();
    global.menu.createStatusBarBlock(context);

    let docSelector = {
        scheme: "file"
    };

    // const pluginRun = pluginFirstRun(context);
    // if(!pluginRun) {
    //     let codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
    //         docSelector,
    //         new LensProvider()
    //     );
    //     context.subscriptions.push(codeLensProviderDisposable);
    // }

    // Register our CodeLens provider
    // let codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
    //     docSelector,
    //     new LensProvider()
    // );
    // context.subscriptions.push(codeLensProviderDisposable);

    let store = context.globalState;
    const handleUri = (uri: vscode.Uri) => {
        const queryParams = new URLSearchParams(uri.query);  
        if (queryParams.has('key')) {
            store.update('codify_apiKey', queryParams.get('key'));
            store.update('codify_clientName', queryParams.get('client'));
            global.panelProvider.updateButtons(context);
        }
     };
   
     context.subscriptions.push(
       vscode.window.registerUriHandler({
         handleUri
       })
     );

    const comp = new MyInlineCompletionProvider();
    vscode.languages.registerInlineCompletionItemProvider({pattern: "**"}, comp);

    let disposable4 = vscode.commands.registerCommand('plugin-vscode.esc', () => {
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            let state = estate.state_of_editor(editor);
            if (state.get_mode() === Mode.Diff || state.get_mode() === Mode.DiffWait) {
                if (state.get_mode() === Mode.DiffWait) {
                    fetch.cancelAllRequests();
                }
                if (state.highlight_json_backup !== undefined) {
                    estate.switch_mode(state, Mode.Highlight);
                } else {
                    estate.switch_mode(state, Mode.Normal);
                }
            } else if (state.get_mode() === Mode.Highlight) {
                estate.back_to_normal(state);
            }
            if (state.get_mode() === Mode.Normal) {
                vscode.commands.executeCommand('setContext', 'codify.runEsc', false);
                console.log(["ESC OFF"]);
            }
        }
    });

    let disposable5 = vscode.commands.registerCommand('plugin-vscode.tab', () => {
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            let state = estate.state_of_editor(editor);
            if (state.get_mode() === Mode.Diff) {
                interactiveDiff.accept(editor);
            }
        }
    });

    let disposable3 = vscode.commands.registerCommand('plugin-vscode.highlight', () => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        let state = estate.state_of_editor(editor);
        if (state.get_mode() === Mode.Diff) {
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


    global.panelProvider = new PanelWebview(context);
    let view = vscode.window.registerWebviewViewProvider(
        'codify-presets',
        global.panelProvider,
    );
    context.subscriptions.push(view);


    let settingsCommand = vscode.commands.registerCommand('plugin-vscode.openSettings', () => {
        // SettingsPage.render(context);
    });
    context.subscriptions.push(settingsCommand);
}

export function pluginFirstRun(context: vscode.ExtensionContext) {
    const firstRun = context.globalState.get('codifyFirstRun');
    if (firstRun !== undefined && firstRun) { return true; }
    else {
        context.globalState.update('codifyFirstRun', true);
        return false;
    }
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
        value: estate.global_intent,
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
            estate.saveIntent(intent);
            editor.selection = new vscode.Selection(selection.start, selection.start);
            interactiveDiff.queryDiff(editor, selection, "diff-selection");
        }
    }
    // vscode.window.showInformationMessage(`Got: ${result}`);
}

export function deactivate()
{
}

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
import * as langDB from "./langDB";
import { Mode } from "./estate";
import PanelWebview from "./panel";
import BugPage from "./bug";


declare global {
    var menu: any;
    var panelProvider: any;
    var settingsPage: any;
    var userToken: string;
}


export function activate(context: vscode.ExtensionContext)
{
    let disposable2 = vscode.commands.registerCommand('plugin-vscode.inlineAccepted', editChaining.acceptEditChain);
    global.menu =  new StatusBarMenu();
    global.menu.createStatusBarBlock(context);
    global.menu.statusbarGuest(true);

    let docSelector = {
        scheme: "file"
    };

    context.subscriptions.push(vscode.commands.registerCommand(global.menu.command, status_bar_clicked));

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

    global.userToken = getUserToken(context);

    const comp = new MyInlineCompletionProvider();
    vscode.languages.registerInlineCompletionItemProvider({pattern: "**"}, comp);

    let disposable4 = vscode.commands.registerCommand('plugin-vscode.esc', () => {
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            let state = estate.state_of_editor(editor);
            if (state && (state.get_mode() === Mode.Diff || state.get_mode() === Mode.DiffWait)) {
                if (state.get_mode() === Mode.DiffWait) {
                    fetch.cancelAllRequests();
                }
                if (state.highlight_json_backup !== undefined) {
                    estate.switch_mode(state, Mode.Highlight);
                } else {
                    estate.switch_mode(state, Mode.Normal);
                }
            } else if (state && state.get_mode() === Mode.Highlight) {
                estate.back_to_normal(state);
            }
            if (state && state.get_mode() === Mode.Normal) {
                vscode.commands.executeCommand('setContext', 'codify.runEsc', false);
                console.log(["ESC OFF"]);
            }
        }
    });

    let disposable5 = vscode.commands.registerCommand('plugin-vscode.tab', () => {
        console.log(["TAB"]);
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            let state = estate.state_of_editor(editor);
            if (state && state.get_mode() === Mode.Diff) {
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
        if (state && state.get_mode() === Mode.Diff) {
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

    const auth = checkAuth(context);
    if(auth) {
        global.menu.statusbarGuest(false);
    }


    let settingsCommand = vscode.commands.registerCommand('plugin-vscode.openSettings', () => {
        vscode.commands.executeCommand( 'workbench.action.openSettings', '@ext:smallcloud.codify' );
    });
    context.subscriptions.push(settingsCommand);

    let bugCommand = vscode.commands.registerCommand('plugin-vscode.openBug', () => {
        BugPage.render(context);
    });
    context.subscriptions.push(bugCommand);

    let openLogin = vscode.commands.registerCommand('plugin-vscode.openLogin', () => {
        vscode.env.openExternal(vscode.Uri.parse(`https://max.smallcloud.ai/codify/?login&token=${global.userToken}`));
    });
    context.subscriptions.push(openLogin);
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

export function checkAuth(context:any) {
    const store = context.globalState;
    let apiKey = vscode.workspace.getConfiguration().get('codify.apiKey');
    let userName = store.get('codify_userName');
    if(!apiKey && apiKey === '') { return false; }
    if(!userName && userName === '') { return false; }
    return {'apiKey': apiKey, 'userName': userName};
}

export function getApiKey() {
    const apiKey = vscode.workspace.getConfiguration().get('codify.apiKey');
    if(!apiKey) { return false; }
    return apiKey;
}

export function getUserToken(context: any) {
    const store = context.globalState;
    let token = store.get('codify_userToken');
    if(!token) {
        token = Math.random().toString(36).substring(2, 15) + '-' + Math.random().toString(36).substring(2, 15);
        store.update('codify_userToken',token);
        return token;
    }
    else {
        return token;
    }
}

//
export function deactivate(context: vscode.ExtensionContext)
{
    const store = context.globalState;
    store.update('codify_userName',null);
}


export async function status_bar_clicked()
{
    let editor = vscode.window.activeTextEditor;
    // no login
    // "It takes two clicks to join the waitlist"
    // - login
    if (!editor) {
        // no open text editor:
        // - visit website
        // - file bug report
        return;
    }
    let lang = langDB.language_from_filename(editor.document.fileName);
    let enabled = langDB.is_language_enabled(lang);
    if (enabled) {
        await vscode.workspace.getConfiguration().update("codify.lang", { [lang]: false }, vscode.ConfigurationTarget.Global);
        console.log(["disable", lang]);
    } else {
        let selection = await vscode.window.showInformationMessage(
            "Enable Codify for the programming language \"" + lang + "\"?",
            "Enable",
            "Bug Report..."
        );
        if (selection === "Enable") {
            await vscode.workspace.getConfiguration().update("codify.lang", { [lang]: true }, vscode.ConfigurationTarget.Global);
            console.log(["enable", lang]);
        } else if (selection === "Bug Report...") {
            console.log(["bug report!!!"]);
        }
    }
}

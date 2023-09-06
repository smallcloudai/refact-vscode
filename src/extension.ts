
/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as completionProvider from "./completionProvider";
import * as highlight from "./highlight";
import * as storeVersions from "./storeVersions";
import * as statusBar from "./statusBar";
import * as codeLens from "./codeLens";
import * as interactiveDiff from "./interactiveDiff";
import * as estate from "./estate";
import * as fetchAPI from "./fetchAPI";
import * as usageStats from "./usageStats";
import * as userLogin from "./userLogin";
import * as sidebar from "./sidebar";
import * as usabilityHints from "./usabilityHints";
import * as privacy from "./privacy";
import * as launchRust from "./launchRust";

import { PrivacySettings } from './privacySettings';
import { Mode } from "./estate";
import { open_chat_tab } from "./sidebar";


declare global {
    var status_bar: statusBar.StatusBarMenu;
    var side_panel: sidebar.PanelWebview|undefined;
    var streamlined_login_ticket: string;
    var user_logged_in: string;
    var user_active_plan: string;
    var user_metering_balance: number;
    var global_context: vscode.ExtensionContext|undefined;
    var streamlined_login_countdown: number;
    var longthink_functions_today: {[key: string]: {[key: string]: string}} | undefined;
    var longthink_filters: string[];
    var enable_longthink_completion: boolean;
    var last_positive_result: number;
    var custom_infurl: boolean;
    var chat_v1_style: boolean;
}

async function pressed_call_chat() {
    console.log(["pressed_call_chat"]);
    let editor = vscode.window.activeTextEditor;
    await open_chat_tab("", editor, true, "", "");
}


async function pressed_escape()
{
    console.log(["pressed_escape"]);
    completionProvider.on_esc_pressed();
    let editor = vscode.window.activeTextEditor;
    if (editor) {
        let state = estate.state_of_editor(editor, "pressed_escape");
        if (state) {
            state.diff_lens_pos = Number.MAX_SAFE_INTEGER;
            state.completion_lens_pos = Number.MAX_SAFE_INTEGER;
            codeLens.quick_refresh();
        }
        if (state && (state.get_mode() === Mode.Diff || state.get_mode() === Mode.DiffWait)) {
            if (state.get_mode() === Mode.DiffWait) {
                await fetchAPI.cancel_all_requests_and_wait_until_finished();
            }
            if (state.highlight_json_backup !== undefined) {
                await estate.switch_mode(state, Mode.Highlight);
            } else {
                await estate.switch_mode(state, Mode.Normal);
            }
        } else if (state && state.get_mode() === Mode.Highlight) {
            await estate.back_to_normal(state);
        }
        if (state && state.get_mode() === Mode.Normal) {
            await vscode.commands.executeCommand('setContext', 'refactcx.runEsc', false);
            await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
            console.log(["ESC OFF"]);
        }
    }
}


async function pressed_tab()
{
    let editor = vscode.window.activeTextEditor;
    if (editor) {
        let state = estate.state_of_editor(editor, "pressed_tab");
        if (state && state.get_mode() === Mode.Diff) {
            interactiveDiff.like_and_accept(editor);
        } else {
            vscode.commands.executeCommand("setContext", "refactcx.runTab", false);
        }
    }
}


async function code_lens_clicked(arg0: any)
{
    let editor = vscode.window.activeTextEditor;
    if (editor) {
        let state = estate.state_of_editor(editor, "code_lens_clicked");
        if (!state) {
            return;
        }
        if (arg0 === "APPROVE") {
            await interactiveDiff.like_and_accept(editor);
        } else if (arg0 === "REJECT") {
            await pressed_escape();  // might return to highlight
        } else if (arg0 === "RERUN") {
            await rollback_and_regen(editor);
        } else if (arg0 === "COMP_APPROVE") {
            state.completion_lens_pos = Number.MAX_SAFE_INTEGER;
            codeLens.quick_refresh();
            await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
        } else if (arg0 === "COMP_REJECT") {
            state.completion_lens_pos = Number.MAX_SAFE_INTEGER;
            codeLens.quick_refresh();
            await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
        } else if (arg0 === "COMP_THINK_LONGER") {
            state.completion_longthink = 1;
            await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
            await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        } else {
            console.log(["code_lens_clicked: can't do", arg0]);
        }
    }
}


let global_autologin_timer: NodeJS.Timeout|undefined = undefined;


async function login_clicked()
{
    let got_it = await userLogin.login();
    if (got_it === "OK") {
        global.streamlined_login_countdown = -1;
        return;
    }
    global.streamlined_login_ticket = Math.random().toString(36).substring(2, 15) + '-' + Math.random().toString(36).substring(2, 15);
    userLogin.inference_login_force_retry();
    await vscode.env.openExternal(vscode.Uri.parse(`https://refact.smallcloud.ai/authentication?token=${global.streamlined_login_ticket}&utm_source=plugin&utm_medium=vscode&utm_campaign=login`));
    let i = 0;
    // Ten attempts to login, 30 seconds apart, will show successful login even if the user does nothing (it's faster if they try completion or similar)
    if (global_autologin_timer) {
        clearInterval(global_autologin_timer);
    }
    global_autologin_timer = setInterval(() => {
        global.streamlined_login_countdown = 10 - (i % 10);
        if (global.user_logged_in || i % 10 === 0) {
            userLogin.login();
        } else {
            if (global.side_panel) {
                global.side_panel.update_webview();
            }
        }
        if (global.user_logged_in || i === 200) {
            global.streamlined_login_countdown = -1;
            clearInterval(global_autologin_timer);
            return;
        }
        i++;
    }, 1000);
}


async function f1_pressed()
{
    let editor = vscode.window.activeTextEditor;
    if (editor) {
        let state = estate.state_of_editor(editor, "f1_pressed");
        if (state && state.get_mode() === Mode.Diff) {
            rollback_and_regen(editor);
            return;
        }
    }
    await vscode.commands.executeCommand("refactai-toolbox.focus");
    await vscode.commands.executeCommand("workbench.action.focusSideBar");
}


export async function inline_accepted(this_completion_serial_number: number)
{
    if (typeof this_completion_serial_number === "number") {
        completionProvider.inline_accepted(this_completion_serial_number);
    } else {
        console.log(["WARNING: inline_accepted no serial number!", this_completion_serial_number]);
    }
    let fired = await usabilityHints.hint_after_successful_completion();
}


export function activate(context: vscode.ExtensionContext)
{
    launchRust.rust_launch(vscode.Uri.joinPath(context.extensionUri, "assets"));
    global.global_context = context;
    global.enable_longthink_completion = false;
    global.streamlined_login_countdown = -1;
    global.last_positive_result = 0;
    let disposable1 = vscode.commands.registerCommand('refactaicmd.inlineAccepted', inline_accepted);
    let disposable2 = vscode.commands.registerCommand('refactaicmd.codeLensClicked', code_lens_clicked);
    global.status_bar = new statusBar.StatusBarMenu();
    global.status_bar.createStatusBarBlock(context);

    context.subscriptions.push(vscode.commands.registerCommand(global.status_bar.command, status_bar_clicked));

    codeLens.save_provider(new codeLens.LensProvider());
    if (codeLens.global_provider) {
        context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: "file" }, codeLens.global_provider));
    }

    const comp = new completionProvider.MyInlineCompletionProvider();
    vscode.languages.registerInlineCompletionItemProvider({pattern: "**"}, comp);

    let disposable4 = vscode.commands.registerCommand('refactaicmd.esc', pressed_escape);
    let disposable5 = vscode.commands.registerCommand('refactaicmd.tab', pressed_tab);
    let disposable3 = vscode.commands.registerCommand('refactaicmd.activateToolbox', f1_pressed);
    let disposable9  = vscode.commands.registerCommand('refactaicmd.addPrivacyOverride0', (uri:vscode.Uri) => {
        if (!uri || !uri.fsPath) {
            return;
        }
        privacy.set_access_override(uri.fsPath, 0);
        PrivacySettings.render(context);
    });
    let disposable10 = vscode.commands.registerCommand('refactaicmd.addPrivacyOverride1', (uri:vscode.Uri) => {
        if (!uri || !uri.fsPath) {
            return;
        }
        privacy.set_access_override(uri.fsPath, 1);
        PrivacySettings.render(context);
    });
    let disposable11 = vscode.commands.registerCommand('refactaicmd.addPrivacyOverride2', (uri:vscode.Uri) => {
        if (!uri || !uri.fsPath) {
            return;
        }
        privacy.set_access_override(uri.fsPath, 2);
        PrivacySettings.render(context);
    });
    let disposable12 = vscode.commands.registerCommand('refactaicmd.privacySettings', () => {
        PrivacySettings.render(context);
    });
    let disposable13 = vscode.commands.registerCommand('refactaicmd.completionManual', async () => {
        await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    });
    let disposable6 = vscode.commands.registerCommand('refactaicmd.callChat', pressed_call_chat);

    context.subscriptions.push(disposable3);
    context.subscriptions.push(disposable4);
    context.subscriptions.push(disposable5);
    context.subscriptions.push(disposable1);
    context.subscriptions.push(disposable2);
    context.subscriptions.push(disposable9);
    context.subscriptions.push(disposable10);
    context.subscriptions.push(disposable11);
    context.subscriptions.push(disposable12);
    context.subscriptions.push(disposable13);
    context.subscriptions.push(disposable6);

    global.side_panel = new sidebar.PanelWebview(context);
    let view = vscode.window.registerWebviewViewProvider(
        'refactai-toolbox',
        global.side_panel,
        {webviewOptions: {retainContextWhenHidden: true}}
    );
    context.subscriptions.push(view);

    let settingsCommand = vscode.commands.registerCommand('refactaicmd.openSettings', () => {
        vscode.commands.executeCommand( 'workbench.action.openSettings', '@ext:smallcloud.codify' );
        // vscode.commands.executeCommand( 'workbench.action.openGlobalKeybindings', 'Refact.ai' );
    });
    context.subscriptions.push(settingsCommand);

    let login = vscode.commands.registerCommand('refactaicmd.login', () => {
        login_clicked();
    });

    let stats_timer = setInterval(() => {
        usageStats.report_usage_stats();
        clearInterval(stats_timer);
        // We at SMC need to know quickly if there is any widespread problems,
        // please look inside: there is not much being sent.
        stats_timer = setInterval(() => {
            usageStats.report_usage_stats();
        }, 3600000); // 1 hour
    }, 60000); // Start with 1 minute, change to 1 hour

    context.subscriptions.push(login);
    let logout = vscode.commands.registerCommand('refactaicmd.logout', async () => {
        context.globalState.update('codifyFirstRun', false);
        await vscode.workspace.getConfiguration().update('refactai.apiKey', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration().update('codify.apiKey', undefined, vscode.ConfigurationTarget.Global);
        fill_no_user();
    });

    context.subscriptions.push(logout);
    context.subscriptions.push(...statusBar.status_bar_init());
    context.subscriptions.push(...estate.estate_init());

    setTimeout(() => {
        userLogin.login();
    }, 100);

    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('refactai.infurl')) {
            setTimeout(() => {
                fill_no_user();
                userLogin.login();
            }, 300);
        }
    });

    first_run_message(context);
}


export function first_run_message(context: vscode.ExtensionContext)
{
    const firstRun = context.globalState.get('codifyFirstRun');
    if (firstRun) { return; };
    context.globalState.update('codifyFirstRun', true);
    userLogin.welcome_message();
}


function fill_no_user()
{
    // AKA low level logout
    global.user_logged_in = "";
    global.user_active_plan = "";
    global.user_metering_balance = 0;
    global.status_bar.choose_color();
    global.longthink_functions_today = {};
    if(global.side_panel) {
        global.side_panel.update_webview();
    }
    vscode.commands.executeCommand("workbench.action.webview.reloadWebviewAction");
}


export async function rollback_and_regen(editor: vscode.TextEditor)
{
    let state = estate.state_of_editor(editor, "rollback_and_regen");
    if (state) {
        await estate.switch_mode(state, Mode.Normal);  // dislike_and_rollback inside
        await interactiveDiff.query_the_same_thing_again(editor);
    }
}


export async function ask_and_save_intent(): Promise<boolean>
{
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
        return false;
    }
    let selection = editor.selection;
    let selection_empty = selection.isEmpty;
    let intent: string | undefined = estate.global_intent;
    intent = await vscode.window.showInputBox({
        title: (selection_empty ?
            "What would you like to do? (this action highlights code first)" :
            "What would you like to do with the selected code?"),
        value: estate.global_intent,
        valueSelection: [0, 80],
        placeHolder: 'Convert to list comprehension',
    });
    if (intent) {
        estate.save_intent(intent);
        return true;
    }
    return false;
}


export async function follow_intent_highlight(intent: string, function_name: string, model_name: string, third_party: boolean)
{
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    if (!intent) {
        return;
    }
    await highlight.query_highlight(editor, intent, function_name, model_name, third_party);
}

export async function follow_intent_diff(intent: string, function_name: string, model_name: string, third_party: boolean)
{
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    if (!intent) {
        return;
    }
    let selection = editor.selection;
    // empty selection will become current line selection
    editor.selection = new vscode.Selection(selection.start, selection.start);  // this clears the selection, moves cursor up
    if (selection.end.line > selection.start.line && selection.end.character === 0) {
        let end_pos_in_chars = editor.document.lineAt(selection.end.line - 1).range.end.character;
        selection = new vscode.Selection(
            selection.start,
            new vscode.Position(selection.end.line - 1, end_pos_in_chars)
        );
    }
    estate.save_intent(intent);
    await interactiveDiff.query_diff(editor, selection, function_name || "diff-selection", model_name, third_party);
}


export function deactivate(context: vscode.ExtensionContext)
{
    usageStats.report_usage_stats();
    global.global_context = undefined;
    launchRust.rust_kill();
}


export async function status_bar_clicked()
{
    let editor = vscode.window.activeTextEditor;
    if (!userLogin.check_if_login_worked()) {
        userLogin.login_message();
        return;
    }
    let selection: string | undefined;
    if (!editor) {
        selection = await vscode.window.showInformationMessage(
            "Welcome to Refact.ai 👋",
            "Open Panel (F1)",
        );
    } else {
        let document_filename = editor.document.fileName;
        let access_level = await privacy.get_file_access(document_filename);
        let chunks = document_filename.split("/");
        let pause_completion = vscode.workspace.getConfiguration().get('refactai.pauseCompletion');
        let buttons: string[] = [];
        if (access_level > 0) {
            buttons.push(pause_completion ? "Resume Completion" : "Pause Completion");
        }
        buttons.push("Privacy Rules");
        selection = await vscode.window.showInformationMessage(
            chunks[chunks.length - 1] + ": Access level " + access_level,
            ...buttons
        );
    }
    if (selection === "Pause Completion") {
        vscode.workspace.getConfiguration().update('refactai.pauseCompletion', true, true);
    } else if (selection === "Resume Completion") {
        vscode.workspace.getConfiguration().update('refactai.pauseCompletion', false, true);
    } else if (selection === "Privacy Rules") {
        vscode.commands.executeCommand("refactaicmd.privacySettings");
    } else if (selection === "Open Panel (F1)") {
        vscode.commands.executeCommand("refactaicmd.activateToolbox");
    }
}

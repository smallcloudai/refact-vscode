/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import {MyInlineCompletionProvider} from "./completionProvider";
import * as highlight from "./highlight";
import * as storeVersions from "./storeVersions";
import * as statusBar from "./statusBar";
import * as codeLens from "./codeLens";
import * as editChaining from "./editChaining";
import * as interactiveDiff from "./interactiveDiff";
import * as estate from "./estate";
import * as fetchAPI from "./fetchAPI";
import * as usageStats from "./usageStats";
import * as userLogin from "./userLogin";
import * as sidebar from "./sidebar";
import * as usabilityHints from "./usabilityHints";
import { Mode } from "./estate";


declare global {
    var status_bar: statusBar.StatusBarMenu;
    var side_panel: sidebar.PanelWebview|undefined;
    var streamlined_login_ticket: string;
    var user_logged_in: string;
    var user_active_plan: string;
    var global_context: vscode.ExtensionContext|undefined;
    var streamlined_login_countdown: number;
    var current_editor_text_edited_event: vscode.Disposable|undefined;
}


async function pressed_escape()
{
    let editor = vscode.window.activeTextEditor;
    if (editor) {
        let state = estate.state_of_editor(editor);
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
            await vscode.commands.executeCommand('setContext', 'codify.runEsc', false);
            await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
            console.log(["ESC OFF"]);
        }
    }
}


async function pressed_tab()
{
    let editor = vscode.window.activeTextEditor;
    if (editor) {
        let state = estate.state_of_editor(editor);
        if (state && state.get_mode() === Mode.Diff) {
            interactiveDiff.like_and_accept(editor);
        } else {
            vscode.commands.executeCommand("setContext", "codify.runTab", false);
        }
    }
}


async function code_lens_clicked(arg0: any)
{
    let editor = vscode.window.activeTextEditor;
    if (editor) {
        let state = estate.state_of_editor(editor);
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
    await vscode.env.openExternal(vscode.Uri.parse(`https://codify.smallcloud.ai/authentication?token=${global.streamlined_login_ticket}&utm_source=plugin&utm_medium=vscode&utm_campaign=login`));
    let i = 0;
    // Ten attempts to login, 30 seconds apart, will show successful login even if the user does nothing (it's faster if they try completion or similar)
    if (global_autologin_timer) {
        clearInterval(global_autologin_timer);
    }
    global_autologin_timer = setInterval(() => {
        global.streamlined_login_countdown = 30 - (i % 30);
        if (global.user_logged_in || i % 30 === 0) {
            userLogin.login();
        } else {
            if (global.side_panel) {
                global.side_panel.update_webview();
            }
        }
        if (global.user_logged_in || i === 300) {
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
    if (!editor) {
        return;
    }
    let state = estate.state_of_editor(editor);
    if (state && state.get_mode() === Mode.Diff) {
        rollback_and_regen(editor);
    } else {
        let success = await ask_and_save_intent();
        if (success) {
            await follow_intent(estate.global_intent);
        }
    }
}


export async function inline_accepted()
{
    await usabilityHints.hint_after_successful_completion();
}


export function activate(context: vscode.ExtensionContext)
{
    global.global_context = context;
    global.streamlined_login_countdown = -1;
    let disposable1 = vscode.commands.registerCommand('plugin-vscode.inlineAccepted', inline_accepted);
    let disposable2 = vscode.commands.registerCommand('plugin-vscode.codeLensClicked', code_lens_clicked);
    global.status_bar = new statusBar.StatusBarMenu();
    global.status_bar.createStatusBarBlock(context);

    context.subscriptions.push(vscode.commands.registerCommand(global.status_bar.command, status_bar_clicked));

    codeLens.save_provider(new codeLens.LensProvider());
    if (codeLens.global_provider) {
        context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: "file" }, codeLens.global_provider));
    }

    const comp = new MyInlineCompletionProvider();
    vscode.languages.registerInlineCompletionItemProvider({pattern: "**"}, comp);

    let disposable4 = vscode.commands.registerCommand('plugin-vscode.esc', pressed_escape);
    let disposable5 = vscode.commands.registerCommand('plugin-vscode.tab', pressed_tab);
    let disposable3 = vscode.commands.registerCommand('plugin-vscode.highlight', f1_pressed);
    let disposable8 = vscode.commands.registerCommand('plugin-vscode.editChaining',  manual_edit_chaining);

    let disposables = storeVersions.store_versions_init();

    context.subscriptions.push(disposable3);
    context.subscriptions.push(disposable4);
    context.subscriptions.push(disposable5);
    context.subscriptions.push(disposable1);
    context.subscriptions.push(disposable2);
    context.subscriptions.push(disposable8);
    context.subscriptions.push(...disposables);

    global.side_panel = new sidebar.PanelWebview(context);
    let view = vscode.window.registerWebviewViewProvider(
        'codify-presets',
        global.side_panel,
        {webviewOptions: {retainContextWhenHidden: true}}
    );
    context.subscriptions.push(view);

    let settingsCommand = vscode.commands.registerCommand('plugin-vscode.openSettings', () => {
        vscode.commands.executeCommand( 'workbench.action.openSettings', '@ext:smallcloud.codify' );
    });
    context.subscriptions.push(settingsCommand);

    let login = vscode.commands.registerCommand('plugin-vscode.login', login_clicked);

    let stats_timer = setInterval(() => {
        usageStats.report_usage_stats();
        clearInterval(stats_timer);
        // We at SMC need to know quickly if there is any widespread problems,
        // please look inside: there is not much being sent.
        stats_timer = setInterval(() => {
            usageStats.report_usage_stats();
        }, 86400000);
    }, 60000); // Start with 1 minute, change to 24 hours

    context.subscriptions.push(login);

    let logout = vscode.commands.registerCommand('plugin-vscode.logout', () => {
        context.globalState.update('codifyFirstRun', false);
        vscode.workspace.getConfiguration().update('codify.apiKey', '',vscode.ConfigurationTarget.Global);
        global.user_logged_in = "";
        global.user_active_plan = "";
        global.status_bar.choose_color();
        if(global.side_panel) {
            global.side_panel.update_webview();
        }
        vscode.commands.executeCommand("workbench.action.webview.reloadWebviewAction");
    });

    context.subscriptions.push(logout);
    context.subscriptions.push(...statusBar.status_bar_init());
    context.subscriptions.push(...estate.estate_init());

    setTimeout(() => {
        userLogin.login();
    }, 100);

    first_run_message(context);
}


export function first_run_message(context: vscode.ExtensionContext)
{
    const firstRun = context.globalState.get('codifyFirstRun');
    if (firstRun) { return; };
    context.globalState.update('codifyFirstRun', true);
    userLogin.welcome_message();
}


export async function manual_edit_chaining()
{
    let editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    let state = estate.state_of_editor(editor);
    if (state) {
        state.diff_lens_pos = Number.MAX_SAFE_INTEGER;
        if (state.get_mode() === Mode.Diff) {
            await rollback_and_regen(editor);
            return;
        }
        await estate.switch_mode(state, estate.Mode.DiffWait);
        try {
            let s = await editChaining.query_edit_chaining(true);
            if (!s) {
                return;
            }
        } finally {
            await estate.back_to_normal(state);
        }
        let modif_doc = state.edit_chain_modif_doc;
        if (modif_doc) {
            state.showing_diff_modif_doc = modif_doc;
            state.showing_diff_move_cursor = true;
            state.showing_diff_for_function = "edit-chain";
            state.showing_diff_for_range = undefined;
            await estate.switch_mode(state, estate.Mode.Diff);
        }
    }
}


export async function rollback_and_regen(editor: vscode.TextEditor)
{
    let state = estate.state_of_editor(editor);
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


export async function follow_intent(intent: string, function_name_force: string = "", use_longthink: boolean = false)
{
    let function_name: string = function_name_force ? function_name_force : "diff-selection";    

    let editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    if (!intent) {
        return;
    }
    let selection = editor.selection;
    let selection_empty = selection.isEmpty;
    if (selection_empty) {
        await highlight.query_highlight(editor, intent);
    } else {
        editor.selection = new vscode.Selection(selection.start, selection.start);  // this clears the selection, moves cursor up
        if (selection.end.line > selection.start.line && selection.end.character === 0) {
            selection = new vscode.Selection(selection.start, selection.end.translate(-1, 0));
        }
        estate.save_intent(intent);
        await interactiveDiff.query_diff(editor, selection, function_name, use_longthink);
    }
}


export function deactivate(context: vscode.ExtensionContext)
{
    global.global_context = undefined;
}


export async function status_bar_clicked()
{
    let editor = vscode.window.activeTextEditor;
    if (!userLogin.check_if_login_worked()) {
        userLogin.login_message();
        return;
    }
    // no login
    // "It takes two clicks to join the waitlist"
    // - login
    if (!editor) {
        // no open text editor:
        // - visit website
        // - file bug report
        return;
    }
    let lang = editor.document.languageId;
    let enabled = estate.is_lang_enabled(editor.document);
    if (enabled) {
        await vscode.workspace.getConfiguration().update("codify.lang", { [lang]: false }, vscode.ConfigurationTarget.Global);
        console.log(["disable", lang]);
        global.status_bar.set_language_enabled(true, lang);
        global.status_bar.choose_color();
    } else {
        let selection = await vscode.window.showInformationMessage(
            "Enable Codify for the programming language \"" + lang + "\"?",
            "Enable",
            // "Bug Report..."
        );
        if (selection === "Enable") {
            await vscode.workspace.getConfiguration().update("codify.lang", { [lang]: true }, vscode.ConfigurationTarget.Global);
            console.log(["enable", lang]);
            global.status_bar.set_language_enabled(false, lang);
            global.status_bar.choose_color();
        // } else if (selection === "Bug Report...") {
        //     vscode.commands.executeCommand("plugin-vscode.openBug");
        }
    }
}

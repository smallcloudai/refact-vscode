
/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as completionProvider from "./completionProvider";
import * as statusBar from "./statusBar";
import * as codeLens from "./codeLens";
import * as interactiveDiff from "./interactiveDiff";
import * as estate from "./estate";
import * as fetchAPI from "./fetchAPI";
import * as userLogin from "./userLogin";
import * as sidebar from "./sidebar";
import * as usabilityHints from "./usabilityHints";
import * as privacy from "./privacy";
import * as launchRust from "./launchRust";
import { RefactConsoleProvider } from './rconsoleProvider';
import * as rconsoleCommands from "./rconsoleCommands";

import * as os from 'os';
import * as path from 'path';
import { PrivacySettings } from './privacySettings';
import { Mode } from "./estate";
import { open_chat_tab } from "./sidebar";
import { fileURLToPath } from 'url';
import { ChatTab } from './chatTab';
import { FimDebugData } from 'refact-chat-js/dist/events';

declare global {
    var rust_binary_blob: launchRust.RustBinaryBlob|undefined;
    var status_bar: statusBar.StatusBarMenu;
    var side_panel: sidebar.PanelWebview|undefined;
    var streamlined_login_ticket: string;
    var streamlined_login_countdown: number;
    var user_logged_in: string;
    var user_active_plan: string;
    var user_metering_balance: number;
    var api_key: string;
    var global_context: vscode.ExtensionContext;
    var enable_longthink_completion: boolean;
    var last_positive_result: number;
    var chat_models: string[];
    var chat_default_model: string;
    var have_caps: boolean;
    var open_chat_tabs: ChatTab[];
    var comment_disposables: vscode.Disposable[];
    var comment_file_uri: vscode.Uri|undefined;

    var toolbox_config: launchRust.ToolboxConfig | undefined;
    var toolbox_command_disposables: vscode.Disposable[];

    var fim_data_cache: FimDebugData | undefined;
}

async function pressed_call_chat(n = 0) {
    let editor = vscode.window.activeTextEditor;
    if(global.side_panel && !global.side_panel._view) {

        await vscode.commands.executeCommand(sidebar.default.viewType + ".focus");

        const delay = (n + 1) * 10;
        if(delay > 200) { return; }

        setTimeout(() => pressed_call_chat(n + 1), delay);
        return;
    } else if (global.side_panel && global.side_panel._view && !global.side_panel?._view?.visible) {
        global.side_panel._view.show();
    }

    await open_chat_tab(
        "",
        editor,
        true,    // attach file default
        "",      // model
        [],      // messages
        "",      // chat id
        true,    // append snippet
    );
}


async function pressed_escape()
{
    console.log(["pressed_escape"]);
    completionProvider.on_esc_pressed();
    let editor = vscode.window.activeTextEditor;
    if (global.comment_disposables) {
        // let original_editor_uri = rconsoleProvider.refact_console_close();
        let original_editor_uri = RefactConsoleProvider.close_all_consoles();
        if (original_editor_uri !== undefined) {
            let original_editor = vscode.window.visibleTextEditors.find((e) => {
                return e.document.uri === original_editor_uri;
            });
            if (original_editor) {
                editor = original_editor;
            }
        }
        // don't return, remove all other things too -- we are here because Esc in the comment thread
    }
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
    if (global.comment_disposables) {
        // let original_editor_uri = rconsoleProvider.refact_console_close();
        let original_editor_uri = RefactConsoleProvider.close_all_consoles();
        if (original_editor_uri !== undefined) {
            let original_editor = vscode.window.visibleTextEditors.find((e) => {
                return e.document.uri === original_editor_uri;
            });
            if (original_editor) {
                editor = original_editor;
            }
        }
        // fall through, accept the diff
    }
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
            // rconsoleProvider.refact_console_close();
            RefactConsoleProvider.close_all_consoles();
        } else if (arg0 === "REJECT") {
            await pressed_escape();  // might return to highlight
        } else if (arg0 === "RERUN") {
            await rollback_and_regen(editor);
        // } else if (arg0 === "COMP_APPROVE") {
        //     state.completion_lens_pos = Number.MAX_SAFE_INTEGER;
        //     codeLens.quick_refresh();
        //     await vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
        // } else if (arg0 === "COMP_REJECT") {
        //     state.completion_lens_pos = Number.MAX_SAFE_INTEGER;
        //     codeLens.quick_refresh();
        //     await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
        // } else if (arg0 === "COMP_THINK_LONGER") {
        //     state.completion_longthink = 1;
        //     await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
        //     await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
        } else {
            console.log(["code_lens_clicked: can't do", arg0]);
        }
    }
}


let global_autologin_timer: NodeJS.Timeout|undefined = undefined;


async function login_clicked()
{
    if (userLogin.secret_api_key()) {
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
        let have_key = !!userLogin.secret_api_key();
        global.streamlined_login_countdown = 10 - (i % 10);
        if (!have_key && i % 10 === 0) {
            userLogin.streamlined_login();
        }
        global.side_panel?.update_webview();  // shows countdown
        if (have_key || i === 200) {
            global.streamlined_login_countdown = -1;
            clearInterval(global_autologin_timer);
            return;
        }
        i++;
    }, 1000);
}


export async function f1_pressed()
{
    let editor = vscode.window.activeTextEditor;
    if (editor) {
        let state = estate.state_of_editor(editor, "f1_pressed");
        if (state && state.get_mode() === Mode.Diff) {
            rollback_and_regen(editor);
            return;
        }
        if (state) {
            // rconsoleProvider.open_refact_console_between_lines(editor);
            RefactConsoleProvider.open_between_lines(editor);
        }
    }
    // await vscode.commands.executeCommand("refactai-toolbox.focus");
    // await vscode.commands.executeCommand("workbench.action.focusSideBar");
}


export async function inline_accepted(this_completion_serial_number: number)
{
    if (typeof this_completion_serial_number === "number") {
        await completionProvider.inline_accepted(this_completion_serial_number);
    } else {
        console.log(["WARNING: inline_accepted no serial number!", this_completion_serial_number]);
    }
    let fired = await usabilityHints.hint_after_successful_completion();
}


export function activate(context: vscode.ExtensionContext)
{
    global.global_context = context;
    global.enable_longthink_completion = false;
    global.streamlined_login_countdown = -1;
    global.last_positive_result = 0;
    global.chat_models = [];
    global.have_caps = false;
    global.chat_default_model = "";
    global.user_logged_in = "";
    global.user_active_plan = "";
    global.api_key = "";
    global.user_metering_balance = 0;
    let disposable1 = vscode.commands.registerCommand('refactaicmd.inlineAccepted', inline_accepted);
    let disposable2 = vscode.commands.registerCommand('refactaicmd.codeLensClicked', code_lens_clicked);
    global.status_bar = new statusBar.StatusBarMenu();
    global.status_bar.createStatusBarBlock(context);
    global.open_chat_tabs = [];
    global.toolbox_command_disposables = [];

    context.subscriptions.push(vscode.commands.registerCommand("refactaicmd.statusBarClick", status_bar_clicked));

    codeLens.save_provider(new codeLens.LensProvider());
    if (codeLens.global_provider) {
        context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: "file" }, codeLens.global_provider));
    }

    const comp = new completionProvider.MyInlineCompletionProvider();
    vscode.languages.registerInlineCompletionItemProvider({pattern: "**"}, comp);

    let disposable4 = vscode.commands.registerCommand('refactaicmd.esc', pressed_escape);
    let disposable5 = vscode.commands.registerCommand('refactaicmd.tab', pressed_tab);
    let disposable3 = vscode.commands.registerCommand('refactaicmd.activateToolbox', f1_pressed);
    let disposable9 = vscode.commands.registerCommand('refactaicmd.addPrivacyOverride0', (uri:vscode.Uri) => {
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
        await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
        await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    });
    let disposable6 = vscode.commands.registerCommand('refactaicmd.callChat', pressed_call_chat);

    let toolbar_command_disposable = new vscode.Disposable(() => {
        global.toolbox_command_disposables.forEach(d => d.dispose());
    });

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
    context.subscriptions.push(toolbar_command_disposable);

    global.rust_binary_blob = new launchRust.RustBinaryBlob(
        fileURLToPath(vscode.Uri.joinPath(context.extensionUri, "assets").toString())
    );
    global.rust_binary_blob
        .settings_changed() // async function will finish later
        .then(() => fetchAPI.maybe_show_rag_status());

    global.side_panel = new sidebar.PanelWebview(context);
    let view = vscode.window.registerWebviewViewProvider(
        'refactai-toolbox',
        global.side_panel,
        {webviewOptions: {retainContextWhenHidden: true}}
    );
    context.subscriptions.push(view);

    let settingsCommand = vscode.commands.registerCommand('refactaicmd.openSettings', () => {
        vscode.commands.executeCommand( 'workbench.action.openSettings', '@ext:smallcloud.codify' );
    });
    context.subscriptions.push(settingsCommand);

    let login = vscode.commands.registerCommand('refactaicmd.login', () => {
        login_clicked();
    });

    context.subscriptions.push(login);
    let logout = vscode.commands.registerCommand('refactaicmd.logout', async () => {
        context.globalState.update('codifyFirstRun', false);
        global.api_key = '';
        await vscode.workspace.getConfiguration().update('refactai.apiKey', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration().update('refactai.addressURL', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration().update('codify.apiKey', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration().update('refactai.apiKey', undefined, vscode.ConfigurationTarget.Workspace);
        await vscode.workspace.getConfiguration().update('refactai.addressURL', undefined, vscode.ConfigurationTarget.Workspace);
        await vscode.workspace.getConfiguration().update('codify.apiKey', undefined, vscode.ConfigurationTarget.Workspace);
        fill_no_user();
        vscode.commands.executeCommand("workbench.action.webview.reloadWebviewAction");
    });

    context.subscriptions.push(logout);
    context.subscriptions.push(...statusBar.status_bar_init());
    context.subscriptions.push(...estate.estate_init());

    const home = path.posix.format(path.parse(os.homedir()));
    const toolbox_config_file_posix_path = path.posix.join(
        home,
        ".cache",
        "refact",
        "customization.yaml"
    );

    const toolbox_config_file_uri = vscode.Uri.file(toolbox_config_file_posix_path);

    const openPromptCustomizationPage = vscode.commands.registerCommand(
        "refactaicmd.openPromptCustomizationPage",
        () => vscode.commands.executeCommand("vscode.open", toolbox_config_file_uri)
    );

    context.subscriptions.push(openPromptCustomizationPage);

    const reloadOnCommandFileChange = vscode.workspace.onDidSaveTextDocument(document => {
        if(document.fileName === toolbox_config_file_uri.fsPath) {
            global.rust_binary_blob?.fetch_toolbox_config();
        }
    });

    context.subscriptions.push(reloadOnCommandFileChange);


    let config_debounce: NodeJS.Timeout|undefined;
    vscode.workspace.onDidChangeConfiguration(e => {
        // TODO: update commands here?
        if (
            e.affectsConfiguration("refactai.infurl") ||
            e.affectsConfiguration("refactai.addressURL") ||
            e.affectsConfiguration("refactai.xDebug") ||
            e.affectsConfiguration("refactai.apiKey") ||
            e.affectsConfiguration("refactai.insecureSSL") ||
            e.affectsConfiguration("refactai.ast") ||
            e.affectsConfiguration("refactai.astLightMode") ||
            e.affectsConfiguration("refactai.vecdb") ||
            e.affectsConfiguration("refactai.astFileLimit")
        ) {
            if (config_debounce) {
                clearTimeout(config_debounce);
            }
            config_debounce = setTimeout(() => {
                fill_no_user();
                if (global.rust_binary_blob) {
                    global.rust_binary_blob.settings_changed();
                }
                userLogin.inference_login();
            }, 1000);
        }

        if (e.affectsConfiguration("refactai.apiKey")) {
            global.side_panel?.goto_main();
        }

        if (
            e.affectsConfiguration("refactai.ast") ||
            e.affectsConfiguration("refactai.astFileLimit") ||
            e.affectsConfiguration("refactai.vecdb")
        )  {
            const hasAst = vscode.workspace.getConfiguration().get<boolean>("refactai.ast");
            if(hasAst) {
                fetchAPI.maybe_show_rag_status();
            }
            const hasVecdb = vscode.workspace.getConfiguration().get<boolean>("refactai.vecdb");
            if(hasVecdb) {
                fetchAPI.maybe_show_rag_status();
            }
        }
    });


    first_run_message(context);

    // async function, don't wait for it
    userLogin.inference_login();
}


export function first_run_message(context: vscode.ExtensionContext)
{
    let have_key = !!userLogin.secret_api_key();
    if (have_key) {
        return;
    }
    userLogin.welcome_message();
}


function fill_no_user()
{
    // AKA low level logout
    global.user_logged_in = "";
    global.user_active_plan = "";
    global.user_metering_balance = 0;
    global.status_bar.choose_color();
    if(global.side_panel) {
        global.side_panel.update_webview();
    }
}


export async function rollback_and_regen(editor: vscode.TextEditor)
{
    let state = estate.state_of_editor(editor, "rollback_and_regen");
    if (state) {
        await estate.switch_mode(state, Mode.Normal);  // dislike_and_rollback inside
        // await interactiveDiff.query_the_same_thing_again(editor);
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


// export async function follow_intent_highlight(intent: string, function_name: string, model_name: string, third_party: boolean)
// {
//     let editor = vscode.window.activeTextEditor;
//     if (!editor) {
//         return;
//     }
//     if (!intent) {
//         return;
//     }
//     await highlight.query_highlight(editor, intent, function_name, model_name, third_party);
// }

// export async function follow_intent_diff(intent: string, function_name: string, model_name: string, third_party: boolean)
// {
//     let editor = vscode.window.activeTextEditor;
//     if (!editor) {
//         return;
//     }
//     if (!intent) {
//         return;
//     }
//     let selection = editor.selection;
//     // empty selection will become current line selection
//     editor.selection = new vscode.Selection(selection.start, selection.start);  // this clears the selection, moves cursor up
//     if (selection.end.line > selection.start.line && selection.end.character === 0) {
//         let end_pos_in_chars = editor.document.lineAt(selection.end.line - 1).range.end.character;
//         selection = new vscode.Selection(
//             selection.start,
//             new vscode.Position(selection.end.line - 1, end_pos_in_chars)
//         );
//     }
//     estate.save_intent(intent);
//     await interactiveDiff.query_diff(editor, selection, function_name || "diff-selection", model_name, third_party);
// }


export async function deactivate(context: vscode.ExtensionContext)
{
    // global.global_context = undefined;
    if (global.rust_binary_blob) {
        await global.rust_binary_blob.terminate();
        global.rust_binary_blob = undefined;
    }
}


export async function status_bar_clicked()
{
    let editor = vscode.window.activeTextEditor;
    if (!userLogin.secret_api_key()) {
        userLogin.login_message();
        return;
    }
    let selection: string | undefined;

    if (global.status_bar.ast_warning) {
        selection = await vscode.window.showInformationMessage(
            "AST file number limit reached, you can increase the limit in settings or disable AST.",
            "Open Settings",
        );
        if (selection === "Open Settings") {
            await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:smallcloud.codify");
        }
    } else if (!editor) {
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
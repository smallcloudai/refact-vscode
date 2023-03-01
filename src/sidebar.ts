/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as estate from "./estate";
import * as userLogin from "./userLogin";
import * as dataCollectionPage from "./dataCollectionPage";
import * as dataCollection from "./dataCollection";
import * as extension from "./extension";

export class PanelWebview implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _history: string[] = [];

    constructor(private readonly _context: any) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
        ) {
            this._view = webviewView;

            webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        this.update_webview();

        vscode.commands.registerCommand('workbench.action.focusSideBar', () => {
            webviewView.webview.postMessage({ command: "focus" });
        });

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                // case "toolboxSelected": {
                //     vscode.window.onDidChangeTextEditorSelection((e) => {
                //         this.check_selection();
                //     });
                // }
                case "presetSelected": {
                    if(vscode.workspace.getConfiguration().get('codify.autoHideSidebar')) {
                        vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
                    }
                    console.log('*** presetSelected ***',data);
                    let editor = vscode.window.activeTextEditor;
                    if (!editor) {
                        return;
                    }
                    let state = estate.state_of_editor(editor, "presetSelected");

                    let data_function: any = data.data_function ? JSON.parse(data.data_function): {};
                    if (!data_function) {
                        console.log(["data_function is not defined", data_function]);
                        return;
                    }

                    let model_force: string = data_function.model;
                    let selection = editor.selection;
                    let selection_empty = selection.isEmpty;
                    let function_name: string = "";
                    let selected_lines_count = selection.end.line - selection.start.line + 1;
                    if (selection_empty) {
                        function_name = data_function.function_highlight;
                        if (selection_empty && data_function.supports_highlight === false) {
                            console.log(["no selection, but function", function_name, "doesn't support highlight"]);
                            return;
                        }
                    } else {
                        function_name = data_function.function_selection;
                        if (data_function.supports_selection === false) {
                            console.log(["selection present, but", function_name, "doesn't support selection"]);
                            return;
                        }
                    }
                    if (typeof function_name !== "string") {
                        console.log(["function_name is not a string", function_name]);
                        return;
                    }
                    if (state) {
                        state.diff_lens_pos = Number.MAX_SAFE_INTEGER;
                        state.completion_lens_pos = Number.MAX_SAFE_INTEGER;
                        await estate.switch_mode(state, estate.Mode.Normal);
                    }
                    await extension.follow_intent(data.value, function_name, model_force);
                    break;
                }

                case "login": {
                    vscode.commands.executeCommand('plugin-vscode.login');
                    break;
                }
                case "logout": {
                    vscode.commands.executeCommand("plugin-vscode.logout");
                    break;
                }
                case "js2ts_goto_profile": {
                    vscode.env.openExternal(vscode.Uri.parse(`https://codify.smallcloud.ai/account?utm_source=plugin&utm_medium=vscode&utm_campaign=account`));
                    break;
                }
                case "js2ts_goto_datacollection": {
                    if (global.global_context !== undefined) {
                        dataCollectionPage.DataReviewPage.render(global.global_context);
                        dataCollection.data_collection_prepare_package_for_sidebar();
                    }
                    break;
                }
                case "js2ts_refresh_login": {
                    global.user_logged_in = "";
                    global.user_active_plan = "";
                    this.update_webview();
                    await userLogin.login();
                    break;
                }
                case "openSettings": {
                    vscode.commands.executeCommand("plugin-vscode.openSettings");
                }
                // case "checkSelection": {
                //     this.check_selection();
                //     break;
                // }
                // case "checkSelectionDefault": {
                //     this.check_selection_default(data.intent);
                //     break;
                // }
            }
        });
    }

    public update_editor_state(state: any) {
        console.log('---------------------___>>> editor state updated');
        this._view!.webview.postMessage({
            command: "editor_state",
            value: estate.state_of_editor(state)
        });
    }

    // public check_selection() {

    //     let current_selection = false;
    //     let editor = vscode.window.activeTextEditor;
    //     if (!editor) {
    //         return false;
    //     }
    //     let selection = editor.selection;
    //     if( selection) {
    //         current_selection = true;
    //     }
    //     if (selection.isEmpty) {
    //         current_selection = false;
    //     }
    //     console.log('xxxxxxxxxxxxxxxxxxxxxx checking selection',current_selection);
    //     this._view!.webview.postMessage({
    //         command: "selection",
    //         value: current_selection
    //     });
    // }

    // public check_selection_default(intent: string) {

    //     let current_selection = false;
    //     let editor = vscode.window.activeTextEditor;
    //     if (!editor) {
    //         return false;
    //     }
    //     let selection = editor.selection;
    //     if( selection) {
    //         current_selection = true;
    //     }
    //     if (selection.isEmpty) {
    //         current_selection = false;
    //     }
    //     this._view!.webview.postMessage({
    //         command: "selectionDefault",
    //         value: current_selection,
    //         intent: intent
    //     });
    // }

    public update_webview()
    {
        if (!this._view) {
            return;
        }
        let plan_msg = global.user_active_plan;
        if (!plan_msg && global.streamlined_login_countdown > -1) {
            plan_msg = `Waiting for website login... ${global.streamlined_login_countdown}`;
        } else if (plan_msg) {
            plan_msg = "Active Plan: <b>" + plan_msg + "</b>";
        }
        this._view!.webview.postMessage({
            command: "ts2web",
            ts2web_user: global.user_logged_in,
            ts2web_plan: plan_msg,
            ts2web_metering_balance: global.user_metering_balance,
            longthink_functions: global.longthink_functions_today,
        });
    }


    // public async presetIntent(intent: string) {
    //     let editor = vscode.window.activeTextEditor;
    //     if (!editor) {
    //         return;
    //     }
    //     let selection = editor.selection;
    //     let selectionEmpty = selection.isEmpty;

    //     if (selectionEmpty) {
    //         if (intent) {
    //             highlight.query_highlight(editor, intent);
    //         }
    //     } else {
    //         if (intent) {
    //             estate.saveIntent(intent);
    //             editor.selection = new vscode.Selection(selection.start, selection.start);
    //             interactiveDiff.query_diff(editor, selection, "diff-selection");
    //         }
    //     }
    // }

    // public updateQuery(intent: string) {
    //     if (!this._view) {
    //         return;
    //     }
    //     this._view!.webview.postMessage({ command: "updateQuery", value: intent });
    // }

    // public addHistory(intent: string) {
    //     if (!this._view) {
    //         return;
    //     }
    //     this._history.push(intent);
    //     this._view!.webview.postMessage({
    //         command: "updateHistory",
    //         value: this._history,
    //     });
    // }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, "assets", "sidebar.js")
            );
            const styleMainUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this._context.extensionUri, "assets", "sidebar.css")
                );
                const nonce = this.getNonce();

                return `<!DOCTYPE html>
                <html lang="en">
                <head>
                <meta charset="UTF-8">
                <!--
                    Use a content security policy to only allow loading images from https or from our extension directory,
                    and only allow scripts that have a specific nonce.
                -->
                <!-- <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"> -->
                <meta name="viewport" content="width=device-width, initial-scale=1.0">

                <title>Presets</title>
                <link href="${styleMainUri}" rel="stylesheet">
            </head>
            <body>
                <div class="toolbox">
                    <div class="toolbox-inline">
                        <input class="toolbox-search" id="toolbox-search" placeholder="↓ commands; ↑ history">
                        <button class="toolbox-run toolbox-run-disabled">▶<span>Run</span></button>
                    </div>
                    <div class="toolbox-container">
                        <div class="toolbox-list"></div>
                    </div>
                </div>
                <div id="sidebar" class="sidebar">
                    <div class="sidebar-controls">
                        <button tabindex="-1" id="datacollection">Review Data...</button>
                        <div class="sidebar-logged">Account: <b><span></span></b></div>
                        <div class="sidebar-plan"><span></span><button class="sidebar-plan-button">⟳</button></div>
                        <div class="sidebar-coins"><div class="sidebar-coin"></div><span>0</span></div>
                        <button tabindex="-1" id="login">Login / Register</button>
                        <button tabindex="-1" id="logout">Logout</button>
                        <button tabindex="-1" id="profile"><span>🔗</span> Your Account...</button>
                        <button tabindex="-1" id="settings">Settings</button>
                    </div>
                </div>
                    <script nonce="${nonce}" src="${scriptUri}"></script>
                </body>
                </html>`;
    }
    getNonce() {
        let text = "";
        const possible =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}

export default PanelWebview;

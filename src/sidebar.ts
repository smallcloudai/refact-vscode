/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as estate from "./estate";
import * as userLogin from "./userLogin";
// import * as dataCollection from "./dataCollection";
// import * as extension from "./extension";
// import * as fetchH2 from 'fetch-h2';
// import * as privacy from "./privacy";
import { ChatTab } from './chatTab';
import ChatHistoryProvider from "./chatHistory";
import { Chat } from "./chatHistory";
import * as crlf from "./crlf";


export async function open_chat_tab(
    question: string,
    editor: vscode.TextEditor | undefined,
    attach_default: boolean,   // checkbox set on start, means attach the current file
    model: string,
    model_function: string = "",
    old_chat: boolean,
    questions: string[] | undefined,
    answers: string[] | undefined,
    chatId: string,
    chatHistoryProvider: ChatHistoryProvider
) {
    if (global.side_panel?.chat) {
        global.side_panel.chat = null;
    }
    if (global.side_panel && global.side_panel._view) {
        let chat: ChatTab = global.side_panel.new_chat(chatId);

        let context: vscode.ExtensionContext | undefined = global.global_context;
        if (!context) {
            return;
        }
        global.side_panel.goto_chat(chat);
        await ChatTab.activate_from_outside(
            question,
            editor,
            attach_default,
            model,
            model_function,
            old_chat,
            questions,
            answers
        );
    }
}

export class PanelWebview implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _history: string[] = [];
    selected_lines_count: number = 0;
    access_level: number = -1;
    cancel_token: vscode.CancellationToken | undefined = undefined;
    public address: string;

    public chat: ChatTab | null = null;
    public chatHistoryProvider: ChatHistoryProvider|undefined;

    constructor(private readonly _context: any) {
        this.chatHistoryProvider = undefined;
        this.address = "";
    }

    public make_sure_have_chat_history_provider()
    {
        if (!this.chatHistoryProvider || this.chatHistoryProvider.currentUser !== global.user_logged_in) {
            this.chatHistoryProvider = new ChatHistoryProvider(
                this._context,
                global.user_logged_in
            );
        }
        return this.chatHistoryProvider;
    }

    public new_chat(chatId: string)
    {
        this.chat = new ChatTab(this.make_sure_have_chat_history_provider(), chatId);
        this.address = chatId;
        return this.chat;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        cancel_token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        this.cancel_token = cancel_token;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri],
        };
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.update_webview();
            }
        });

        this.goto_main();

        vscode.commands.registerCommand('workbench.action.focusSideBar', () => {
            webviewView.webview.postMessage({ command: "focus" });
        });

        webviewView.webview.onDidReceiveMessage(async (data) => {
            this.js2ts_message(data);
        });
    }

    public goto_main()
    {
        this.address = "";
        if (!this._view) {
            return;
        }
        this._view.webview.html = this.html_main_screen(this._view.webview);
        this.update_webview();
    }

    public goto_chat(chat: ChatTab)
    {
        this.address = chat.chatId;
        if (!this._view) {
            return;
        }
        this._view.webview.html = chat.get_html_for_chat(
            this._view.webview,
            this._context.extensionUri
        );
        this.update_webview();
    }

    public update_chat_history()
    {
        const history = this.make_sure_have_chat_history_provider().getChatNamesSortedByTime();
        if (this._view) {
            this._view.webview.postMessage({
                command: "loadHistory",
                history: history,
            });
        }
    }

    public async js2ts_message(data: any)
    {
        if (!this._view) {
            return;
        }
        console.log(`RECEIVED JS2TS: ${JSON.stringify(data)}`);
        switch (data.type) {
            case "focus_back_to_editor": {
                vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
                break;
            }
            case "open_new_chat": {
                let question = data.question;
                // let chat_empty = data.chat_empty;
                if (!question) {
                    question = "";
                }
                let editor = vscode.window.activeTextEditor;
                let attach_default = !!vscode.window.activeTextEditor;
                await open_chat_tab(
                    question,
                    editor,
                    attach_default,
                    data.chat_model,
                    data.chat_model_function,
                    false,
                    [],
                    [],
                    "",
                    this.make_sure_have_chat_history_provider()
                );
                break;
            }
            case "delete_chat": {
                const chatId = data.chatId;
                await this.make_sure_have_chat_history_provider().deleteChatEntry(chatId);
                break;
            }
            case "open_old_chat": {
                const chatId = data.chatId;
                if (!chatId) {
                    break;
                }
                let editor = vscode.window.activeTextEditor;
                let chat: Chat | undefined = await this.make_sure_have_chat_history_provider().getChat(chatId);
                await open_chat_tab(
                    "",
                    editor,
                    true,
                    data.chat_model,
                    data.chat_model_function,
                    true,
                    chat?.questions,
                    chat?.answers,
                    chatId,
                    this.make_sure_have_chat_history_provider()
                );
                break;
            }
            case "button_hf_open_tokens": {
                vscode.env.openExternal(vscode.Uri.parse(`https://huggingface.co/settings/tokens`));
                break;
            }
            case "button_hf_save": {
                await vscode.workspace.getConfiguration().update('refactai.apiKey', data.hf_api_key, vscode.ConfigurationTarget.Global);
                await vscode.workspace.getConfiguration().update('refactai.addressURL', "HF", vscode.ConfigurationTarget.Global);
                break;
            }
            case "button_refact_save": {
                await vscode.workspace.getConfiguration().update('refactai.apiKey', data.refact_api_key, vscode.ConfigurationTarget.Global);
                await vscode.workspace.getConfiguration().update('refactai.addressURL', "Refact", vscode.ConfigurationTarget.Global);
                break;
            }
            case "button_refact_open_streamlined": {
                vscode.commands.executeCommand('refactaicmd.login');
                break;
            }
            case "button_refact_save": {
                await vscode.workspace.getConfiguration().update('refactai.apiKey', data.refact_api_key, vscode.ConfigurationTarget.Global);
                await vscode.workspace.getConfiguration().update('refactai.addressURL', "SMC", vscode.ConfigurationTarget.Global);
                break;
            }
            case "save_enterprise": {
                await vscode.workspace.getConfiguration().update('refactai.infurl', data.endpoint, vscode.ConfigurationTarget.Global);
                await vscode.workspace.getConfiguration().update('refactai.apiKey', data.apikey, vscode.ConfigurationTarget.Global);
                break;
            }
            case "save_selfhosted": {
                await vscode.workspace.getConfiguration().update('refactai.infurl', data.endpoint, vscode.ConfigurationTarget.Global);
                await vscode.workspace.getConfiguration().update('refactai.apiKey', 'aaa', vscode.ConfigurationTarget.Global);
                break;
            }
            case "privacy": {
                vscode.commands.executeCommand("refactaicmd.privacySettings");
                break;
            }
            case "js2ts_report_bug": {
                vscode.env.openExternal(vscode.Uri.parse(`https://github.com/smallcloudai/refact-vscode/issues`));
                break;
            }
            case "js2ts_discord": {
                vscode.env.openExternal(vscode.Uri.parse(`https://www.smallcloud.ai/discord`));
                break;
            }
            case "js2ts_logout": {
                vscode.commands.executeCommand("refactaicmd.logout");
                break;
            }
            case "js2ts_goto_profile": {
                vscode.env.openExternal(vscode.Uri.parse(`https://refact.smallcloud.ai/account?utm_source=plugin&utm_medium=vscode&utm_campaign=account`));
                break;
            }
            case "js2ts_refresh_login": {
                global.user_logged_in = "";
                global.user_active_plan = "";
                this.update_webview();
                await userLogin.inference_login();
                break;
            }
            case "openSettings": {
                vscode.commands.executeCommand("refactaicmd.openSettings");
                break;
            }
            case "openKeys": {
                vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', '@ext:smallcloud.refact');
                break;
            }
            //chat commands
            case "open-new-file": {
                vscode.workspace.openTextDocument().then((document) => {
                    vscode.window.showTextDocument(document, vscode.ViewColumn.Active)
                        .then((editor) => {
                            editor.edit((editBuilder) => {
                            editBuilder.insert(new vscode.Position(0, 0), data.value);
                        });
                    });
                });
                break;
            }
            case "diff-paste-back": {
                if (!this.chat?.working_on_snippet_editor) {
                    return;
                }
                await vscode.window.showTextDocument(
                    this.chat?.working_on_snippet_editor.document,
                    this.chat?.working_on_snippet_column
                );
                let state = estate.state_of_document(
                this.chat?.working_on_snippet_editor.document
                );
                if (!state) {
                    return;
                }
                let editor = state.editor;
                if (state.get_mode() !== estate.Mode.Normal) {
                    return;
                }
                if (!this.chat?.working_on_snippet_range) {
                    return;
                }
                let verify_snippet = editor.document.getText(
                    this.chat?.working_on_snippet_range!
                );
                if (verify_snippet !== this.chat?.working_on_snippet_code) {
                    return;
                }
                let text = editor.document.getText();
                let snippet_ofs0 = editor.document.offsetAt(
                    this.chat?.working_on_snippet_range.start
                );
                let snippet_ofs1 = editor.document.offsetAt(
                    this.chat?.working_on_snippet_range.end
                );
                let modif_doc: string = text.substring(0, snippet_ofs0) + data.value + text.substring(snippet_ofs1);
                [modif_doc] = crlf.cleanup_cr_lf(modif_doc, []);
                state.showing_diff_modif_doc = modif_doc;
                state.showing_diff_move_cursor = true;
                estate.switch_mode(state, estate.Mode.Diff);
                break;
            }
            case "question-posted-within-tab": {
                await this.chat?.chat_post_question(
                data.chat_question,
                data.chat_model,
                data.chat_model_function,
                data.chat_attach_file
                );
                this.chat?.messages.forEach((i) => console.log(i));
            break;
            }
            case "stop-clicked": {
                this.chat?.cancellationTokenSource.cancel();
                break;
            }
            case "reset-messages": {
                if (this.chat?.messages) {
                    this.chat.messages = data.messages_backup;
                    this.make_sure_have_chat_history_provider().popLastMessageFromChat(
                        this.chat?.chatId,
                        true,
                        true
                    );
                }
                break;
            }
            case "back-from-chat": {
                this.goto_main();
                this.chat = null;
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
    }

    public update_webview()
    {
        if (!this._view) {
            return;
        }

        let have_key = !!userLogin.secret_api_key();
        if (have_key) {
            this.update_chat_history();
        }

        let plan_msg = global.user_active_plan;
        if (!plan_msg && global.streamlined_login_countdown > -1) {
            plan_msg = `Waiting for website login... ${global.streamlined_login_countdown}`;
        } else if (plan_msg) {
            plan_msg = "Active Plan: <b>" + plan_msg + "</b>";
        }

        this._view!.webview.postMessage({
            command: "ts2js",
            ts2js_user: global.user_logged_in,
            ts2js_havekey: have_key,
            ts2js_plan: plan_msg,
            ts2js_metering_balance: global.user_metering_balance,
            ts2js_staging: vscode.workspace.getConfiguration().get('refactai.staging'),
        });
    }

    private html_main_screen(webview: vscode.Webview)
    {
        const scriptUri1 = webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, "assets", "sidebar.js")
            );
        const scriptUri2 = webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, "assets", "chat_history.js")
            );
        const styleMainUri1 = webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, "assets", "sidebar.css")
            );
        const styleMainUri2 = webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, "assets", "chat_history.css")
            );
        const nonce = this.getNonce();
        const api_key = vscode.workspace.getConfiguration().get('refactai.apiKey');
        const manual_infurl = vscode.workspace.getConfiguration().get("refactai.infurl");

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

                <title>Main Toolbox</title>
                <link href="${styleMainUri1}" rel="stylesheet">
                <link href="${styleMainUri2}" rel="stylesheet">
            </head>
            <body>
                <div id="sidebar" class="sidebar">
                    <div class="chat-panel">
                        <button tabindex="-1" id="chat"><span></span>New&nbsp;Chat</button>
                    </div>
                    <div class="chat-history">
                        <div class="chat-history-list"></div>
                    </div>

                    <div class="refact-welcome__whole" style="display: none">
                        <div class="refact-welcome__menu">
                            <div class="refact-welcome__container">
                                <div class="refact-welcome__lead">Refact plugin initial setup:</div>

                                <label class="refact-welcome__select" data-type="personal">
                                    <div class="refact-welcome__content">
                                        <input type="radio" class="refact-welcome__radio" value="personal" name="account-type" />
                                        <span>Personal</span>
                                        <div class="refact-welcome__desc">
                                            <ul>
                                                <li>Easy to start</li>
                                                <li>Opt-in telemetry to help this open source project</li>
                                            </ul>
                                        </div>
                                    </div>
                                </label>

                                <label class="refact-welcome__select" data-type="self-hosting">
                                    <div class="refact-welcome__content">
                                        <input type="radio" class="refact-welcome__radio" value="self-hosting" name="account-type" />
                                        <span>Self-hosting</span>
                                        <div class="refact-welcome__desc">
                                            <ul>
                                                <li>Uses your own server</li>
                                                <li>Opt-in telemetry to help this open source project</li>
                                            </ul>
                                        </div>
                                    </div>
                                </label>

                                <label class="refact-welcome__select" data-type="enterprise">
                                <div class="refact-welcome__content">
                                    <input type="radio" class="refact-welcome__radio" value="enterprise" name="account-type" />
                                    <span>Enterprise</span>
                                    <div class="refact-welcome__desc">
                                        <ul>
                                            <li>Doesn't connect to public cloud ever</li>
                                            <li>Uses your private endpoint only</li>
                                            <li>Sends telemetry to your private server</li>
                                        </ul>
                                    </div>
                                </div>
                                </label>

                                <div class="refact-welcome__actions">
                                    <button class="refact-welcome__next">Next&nbsp;&nbsp;&rsaquo;</button>
                                </div>
                            </div>
                        </div>
                        <div class="refact-welcome__enterprise refact-welcome__subscreen">
                            <div>
                                <label class="refact-welcome__label">Endpoint Address</label>
                                <input class="refact-welcome__enterendpoint refact-welcome__input" type="text" name="endpoint_address" value="${manual_infurl}">
                            </div>
                            <div>
                                <label class="refact-welcome__label">API Key</label>
                                <input class="refact-welcome__apikey_enterprise refact-welcome__input" type="text" name="api_key" value="${api_key}">
                            </div>
                            <div class="refact-welcome__actions">
                                <button data-target="enterprise" class="refact-welcome__back">&lsaquo;&nbsp;&nbsp;Back</button>
                                <button class="refact-welcome__savebutton refact-welcome__savebutton--enterprise">Save</button>
                            </div>
                        </div>

                        <div class="refact-welcome__personal refact-welcome__subscreen">
                            <h2>Refact Cloud</h2>
                            <div>
                                <label class="refact-welcome__label">API Key</label>
                                <input class="refact-welcome__apikey_refact refact-welcome__input" type="text" name="api_key" value="${api_key}">
                            </div>
                            <div class="refact-welcome__or">or</div>
                            <button class="refact-welcome__refact">
                                Login / Create Account
                            </button>
                            <div class="refact-welcome__actions">
                                <button data-target="refact" class="refact-welcome__back">&lsaquo;&nbsp;&nbsp;Back</button>
                                <button class="refact-welcome__next refact-welcome__next_refact">Next&nbsp;&nbsp;&rsaquo;</button>
                            </div>
                        </div>

                        <div class="refact-welcome__selfhosted refact-welcome__subscreen">
                            <div>
                                <label class="refact-welcome__label">Endpoint Address</label>
                                <input class="refact-welcome__endpoint refact-welcome__input" type="text" name="endpoint_address" value="${manual_infurl}">
                            </div>
                            <div class="refact-welcome__actions">
                                <button data-target="selfhosted" class="refact-welcome__back">&lsaquo;&nbsp;&nbsp;Back</button>
                                <button class="refact-welcome__savebutton refact-welcome__savebutton--selfhosted">Save</button>
                            </div>
                        </div>
                    </div>

                    <div class="sidebar-controls">
                        <div class="sidebar-controls-inner">
                            <div class="sidebar-buttons">
                                <div></div>
                                <button tabindex="-1" id="privacy"><span></span>Privacy</button>
                                <button tabindex="-1" id="settings"><i></i><span>Settings</span></button>
                                <button tabindex="-1" id="keys"><span></span></button>
                            </div>
                            <div class="sidebar-inline sidebar-account">
                                <div class="sidebar-logged"><b><span></span></b></div>
                                <div class="sidebar-coins">
                                <div class="sidebar-coin"></div><span>0</span></div>
                            </div>
                            <div class="sidebar-inline">
                                <div class="sidebar-plan"><span></span><button class="sidebar-plan-button"></button></div>
                                <button tabindex="-1" id="logout" class=""><span></span>Logout</button>
                            </div>
                            <div class="sidebar-inline">
                                <button tabindex="-1" id="profile"><span></span>Your&nbsp;Account</button>
                                <button tabindex="-1" id="report_bugs"><span></span>Report&nbsp;Bug</button>
                                <button tabindex="-1" id="discord" class=""><span></span>Discord</button>
                            </div>                        
                        </div>
                    </div>
                </div>
                <script nonce="${nonce}" src="${scriptUri1}"></script>
                <script nonce="${nonce}" src="${scriptUri2}"></script>
                <script>
                    const vscode = acquireVsCodeApi();
                    sidebar_general_script(vscode);
                    chat_history_script(vscode);
                </script>
                </body>
                </html>`;
    }

    // private _getHtmlForHistoryWebview(webview: vscode.Webview) {
    //     const scriptUri = webview.asWebviewUri(
    //       vscode.Uri.joinPath(
    //         this._context.extensionUri,
    //         "assets",
    //         "chat_history.js"
    //       )
    //     );
    //     const nonce = this.getNonce();
    //     return `<!DOCTYPE html>
    //       <html lang="en">
    //       <head>
    //       <meta charset="UTF-8">
    //       <!--
    //           Use a content security policy to only allow loading images from https or from our extension directory,
    //           and only allow scripts that have a specific nonce.
    //       -->
    //       <!-- <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"> -->
    //       <meta name="viewport" content="width=device-width, initial-scale=1.0">

    //       <title>Presets</title>
    //       <link href="${styleMainUri}" rel="stylesheet">
    //   </head>
    //   <body>
    //       </body>
    //       </html>`;
    // }

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
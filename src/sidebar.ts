/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as estate from "./estate";
import * as userLogin from "./userLogin";
import * as dataCollection from "./dataCollection";
import * as extension from "./extension";
import * as fetchH2 from 'fetch-h2';
import * as privacy from "./privacy";
import { ChatTab } from './chatTab';
import ChatHistoryProvider from "./chatHistory";
import { Chat } from "./chatHistory";
import * as crlf from "./crlf";


export async function open_chat_tab(
    question: string,
    editor: vscode.TextEditor | undefined,
    attach_default: boolean,
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
      global.side_panel.chat = new ChatTab(chatHistoryProvider, chatId);
      let context: vscode.ExtensionContext | undefined = global.global_context;
      if (!context) {
        return;
      }

      global.side_panel._view.webview.html =
        global.side_panel.chat.get_html_for_webview(
          global.side_panel._view.webview,
          context.extensionUri
        );
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

    constructor(private readonly _context: any) {}

    public chat: ChatTab | null = null;

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
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.update_webview();
            }
        });

        this.update_webview();
        // this.get_bookmarks();

        vscode.commands.registerCommand('workbench.action.focusSideBar', () => {
            webviewView.webview.postMessage({ command: "focus" });
        });

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case "focus_back_to_editor": {
                    vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
                    break;
                }
                // case "submit_bookmark": {
                //     this.set_bookmark(data.function_name, data.state);
                //     break;
                // }
                // case "submit_like": {
                //     this.submit_like(data.function_name, data.like);
                //     break;
                // }
                // case "submit_bookmark": {
                //     this.set_bookmark(data.function_name, data.state);
                //     break;
                // }
                case "open_chat_history": {
                    const history =
                      await this.chatHistoryProvider.getChatNamesSortedByTime();

                    webviewView.webview.html = this._getHtmlForHistoryWebview(
                      webviewView.webview
                    );

                    webviewView.webview.postMessage({
                      command: "loadHistory",
                      history: history,
                    });
                    break;
                  }
                case "close_chat_history": {
                    webviewView.webview.html = this._getHtmlForWebview(
                      webviewView.webview
                    );
                    this.update_webview();
                    // this.get_bookmarks();
                    break;
                }
                case "open_new_chat": {
                    let question = data.question;
                    let chat_empty = data.chat_empty;
                    if (!question) {
                        question = "";
                    }
                    let editor = vscode.window.activeTextEditor;
                    if (editor) {
                        let selection = editor.selection;
                        let attach_default = !selection.isEmpty || !chat_empty;
                        if (selection.isEmpty) {
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
                            this.chatHistoryProvider
                          );
                        } else {
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
                            this.chatHistoryProvider
                          );
                        }
                      } else {
                        await open_chat_tab(
                          "",
                          undefined,
                          false,
                          "",
                          "",
                          false,
                          [],
                          [],
                          "",
                          this.chatHistoryProvider
                        );
                      }
                    break;
                }
                case "delete_chat": {
                    const chatId = data.chatId;
                    await this.chatHistoryProvider.deleteChatEntry(chatId);
                }
                case "open_old_chat": {
                    const chatId = data.chatId;
                    if (!chatId) {
                      break;
                    }
                    let editor = vscode.window.activeTextEditor;
                    let chat: Chat | undefined = await this.chatHistoryProvider.getChat(
                      chatId
                    );
                    if (editor) {
                      let selection = editor.selection;
                      let attach_default = !selection.isEmpty;
                      if (selection.isEmpty) {
                        await open_chat_tab(
                          "",
                          editor,
                          attach_default,
                          data.chat_model,
                          data.chat_model_function,
                          true,
                          chat?.questions,
                          chat?.answers,
                          chatId,
                          this.chatHistoryProvider
                        );
                      } else {
                        await open_chat_tab(
                          "",
                          editor,
                          attach_default,
                          data.chat_model,
                          data.chat_model_function,
                          true,
                          chat?.questions,
                          chat?.answers,
                          chatId,
                          this.chatHistoryProvider
                        );
                      }
                    } else {
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
                        this.chatHistoryProvider
                      );
                    }
                    break;
                }
                case "button_hf_open_tokens": {
                    vscode.env.openExternal(vscode.Uri.parse(`https://huggingface.co/settings/tokens`));
                    break;
                }
                // case "function_activated": {
                //     if(vscode.workspace.getConfiguration().get('refactai.autoHideSidebar')) {
                //         vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
                //     }
                //     console.log('*** function_activated ***', data);
                //     if (!data.data_function) {
                //         console.log(["function_dict is not defined", data.data_function]);
                //         return;
                //     }
                //     let function_dict: any = JSON.parse(data.data_function);
                //     let editor = vscode.window.activeTextEditor;
                //     let function_name: string = "";
                //     let model_suggest: string = function_dict.model;
                //     let selected_text = "";
                //     if (editor) {
                //         let state = estate.state_of_editor(editor, "function_activated");
                //         let selection = editor.selection;
                //         let selection_empty = selection.isEmpty;
                //         // let selected_lines_count = selection.end.line - selection.start.line + 1;
                //         // let access_level = await privacy.get_file_access(editor.document.fileName);
                //         // should be, min < selected_lines_count < max, but we don't care because UI was disabled so wrong function is not likely to
                //         // happen, and we have the access level check closer to the socket in query_diff()
                //         if (selection_empty) {
                //             function_name = function_dict.function_highlight;
                //             if (!function_name) {
                //                 function_name = function_dict.function_name;
                //             }
                //             if (selection_empty && function_dict.supports_highlight === false) {
                //                 console.log(["no selection, but function", function_name, "doesn't support highlight"]);
                //                 return;
                //             }
                //         } else {
                //             function_name = function_dict.function_selection;
                //             if (!function_name) {
                //                 function_name = function_dict.function_name;
                //             }
                //             if (function_dict.supports_selection === false) {
                //                 console.log(["selection present, but", function_name, "doesn't support selection"]);
                //                 return;
                //             }
                //         }
                //         if (state) {
                //             let current_mode = state.get_mode();
                //             if (current_mode !== estate.Mode.Normal && current_mode !== estate.Mode.Highlight) {
                //                 console.log([`don't run "${function_name}" because mode is ${current_mode}`]);
                //                 return;
                //             }
                //             state.diff_lens_pos = Number.MAX_SAFE_INTEGER;
                //             state.completion_lens_pos = Number.MAX_SAFE_INTEGER;
                //             await estate.switch_mode(state, estate.Mode.Normal);
                //         }
                //         selected_text = editor.document.getText(selection);
                //     }
                //     if (typeof function_name !== "string") {
                //         console.log(["function_name is not a string", function_name]);
                //         return;
                //     }
                //     let intent: string;
                //     if (function_dict.model_fixed_intent) {
                //         intent = function_dict.model_fixed_intent;
                //     } else {
                //         if (typeof data.intent !== "string") {
                //             console.log(["data.value is not a string", data.value]);
                //             return;
                //         }
                //         intent = data.intent;
                //     }
                //     if (function_name.includes("free-chat")) {
                //         await open_chat_tab(
                //             intent,
                //             editor,
                //             true,
                //             model_suggest,
                //             function_name,
                //             false,
                //             [],
                //             [],
                //             "",
                //             this.chatHistoryProvider
                //           );
                //     } else if (function_dict.supports_highlight && selected_text === "") {
                //         await extension.follow_intent_highlight(intent, function_name, model_suggest, !!function_dict.third_party);
                //     } else if (function_dict.supports_selection && selected_text !== "") {
                //         await extension.follow_intent_diff(intent, function_name, model_suggest, !!function_dict.third_party);
                //     } else if (!function_dict.supports_selection && selected_text === "") {
                //         await extension.follow_intent_diff(intent, function_name, model_suggest, !!function_dict.third_party);
                //     } else {
                //         console.log(["don't know how to run function", function_name]);
                //     }
                //     break;
                // }
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

                        this.chat.chatHistoryProvider.popLastMessageFromChat(
                        this.chat?.chatId,
                        true,
                        true
                    );
                    }
                    break;
                }
                case "back-from-chat": {
                    webviewView.webview.html = this._getHtmlForWebview(
                        webviewView.webview
                    );
                    this.update_webview();
                    // this.get_bookmarks();
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
        }); // onDidReceiveMessage

        // webviewView.webview.postMessage({ command: "focus" });
    } // resolveWebView

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

        let have_key = !!userLogin.secret_api_key();
        console.log(`have_key: ${have_key}`);

        this._view!.webview.postMessage({
            command: "ts2js",
            ts2js_user: global.user_logged_in,
            ts2js_havekey: have_key,
            ts2js_plan: plan_msg,
            ts2js_metering_balance: global.user_metering_balance,
            ts2js_staging: vscode.workspace.getConfiguration().get('refactai.staging'),
        });
    }

    // public async set_bookmark(function_name: string, state: boolean) {
    //     let global_context: vscode.ExtensionContext|undefined = global.global_context;
    //     if (global_context === undefined) {
    public chatHistoryProvider = new ChatHistoryProvider(
        this._context,
        global.user_logged_in
    );

    // public async set_bookmark(function_name: string, state: boolean) {
    //     let global_context: vscode.ExtensionContext|undefined = global.global_context;
    //     if (global_context === undefined) {
    //         return;
    //     }
    //     let data: {[key: string]: boolean} = {};
    //     let bookmarks: {[key: string]: boolean}|undefined = await global_context.globalState.get('refactBookmarks');
    //     if (bookmarks !== undefined) {
    //         data = bookmarks;
    //     }
    //     data[function_name] = state;
    //     console.log(['Setting bookmark:', function_name, state]);
    //     await global_context.globalState.update('refactBookmarks', data);
    //     this.get_bookmarks();
    // }

    // public async get_bookmarks() {
    //     let global_context: vscode.ExtensionContext|undefined = global.global_context;
    //     if (global_context === undefined) {
    //         return 0;
    //     }
    //     let bookmarks_: {[key: string]: boolean}|undefined = await global_context.globalState.get('refactBookmarks');
    //     let bookmarks: {[key: string]: boolean} = {};
    //     if (bookmarks_ !== undefined) {
    //         bookmarks = bookmarks_;
    //     }
    //     return this._view!.webview.postMessage({ command: "update_bookmarks_list", value: bookmarks });
    // }

    // public async submit_like(function_name: string, like: number) {
    //     const apiKey = userLogin.secret_api_key();
    //     if (!apiKey) {
    //         return;
    //     }
    //     const headers = {
    //         "Content-Type": "application/json",
    //         "Authorization": `Bearer ${apiKey}`,
    //     };
    //     let url = `https://www.smallcloud.ai/v1/longthink-like?function_name=${function_name}&like=${like}`;
    //     let response = await fetchH2.fetch(url, {
    //         method: "GET",
    //         headers: headers,
    //     });
    //     if (response.status !== 200) {
    //         console.log([response.status, url]);
    //         return;
    //     }
    //     if (response.status === 200) {
    //         let json = await response.json();
    //         if(json.retcode === 'OK') {
    //             let longthink_functions_today: {[key: string]: {[key: string]: any}} | undefined = global.longthink_functions_today; // any or number
    //             if(longthink_functions_today !== undefined) {
    //                 for (const key of Object.keys(longthink_functions_today)) {
    //                     if(key === function_name) {
    //                         if(json.inserted === 1) {
    //                             longthink_functions_today[key].likes += 1;
    //                             longthink_functions_today[key].is_liked = 1;
    //                         }
    //                         if(json.deleted === 1) {
    //                             longthink_functions_today[key].likes -= 1;
    //                             longthink_functions_today[key].is_liked = 0;
    //                         }
    //                         this._view!.webview.postMessage({ command: "update_longthink_functions", value: longthink_functions_today});
    //                     }
    //                 }
    //             }
    //         }
    //     }
    // }

    // public async presetIntent(intent: string) {
    //     let editor = vscode.window.activeTextEditor;
    //     if (!editor) {
    //         return;
    //     }
    //     let data: {[key: string]: boolean} = {};
    //     let bookmarks: {[key: string]: boolean}|undefined = await global_context.globalState.get('refactBookmarks');
    //     if (bookmarks !== undefined) {
    //         data = bookmarks;
    //     }
    //     data[function_name] = state;
    //     console.log(['Setting bookmark:', function_name, state]);
    //     await global_context.globalState.update('refactBookmarks', data);
    //     this.get_bookmarks();
    // }

    // public async get_bookmarks()
    // {
    //     let global_context: vscode.ExtensionContext|undefined = global.global_context;
    //     if (global_context === undefined) {
    //         return 0;
    //     }
    //     let bookmarks_: {[key: string]: boolean}|undefined = await global_context.globalState.get('refactBookmarks');
    //     let bookmarks: {[key: string]: boolean} = {};
    //     if (bookmarks_ !== undefined) {
    //         bookmarks = bookmarks_;
    //     }
    //     return this._view!.webview.postMessage({ command: "update_bookmarks_list", value: bookmarks });
    // }

    private _getHtmlForWebview(webview: vscode.Webview)
    {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, "assets", "sidebar.js")
            );
        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, "assets", "sidebar.css")
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

                <title>Presets</title>
                <link href="${styleMainUri}" rel="stylesheet">
            </head>
            <body>
                <div id="sidebar" class="sidebar">
                    <div class="toolbox">
                    <div class="refact-welcome__here_be_dragons" style="display: none">New chat will live in the sidebar, under construction.</div>
                    <div class="refact-welcome__whole" style="display: none">
                        <div class="refact-welcome__menu">
                            <div class="refact-welcome__container">
                                <div class="refact-welcome__lead">Refact plugin initial setup:</div>

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
                            <div class="refact-welcome__providers">
                                <label class="refact-welcome__provider" data-type="huggingface">
                                    <div class="refact-welcome__content">
                                        <input type="radio" class="refact-welcome__proradio" value="huggingface" name="provider-type" />
                                        <span>Huggingface Cloud</span>
                                        <div class="refact-welcome__desc">
                                            <ul>
                                                <li>Features</li>
                                            </ul>
                                        </div>
                                    </div>
                                </label>
                                <label class="refact-welcome__provider" data-type="refact">
                                    <div class="refact-welcome__content">
                                        <input type="radio" class="refact-welcome__proradio" value="refact" name="provider-type" />
                                        <span>Refact Cloud</span>
                                        <div class="refact-welcome__desc">
                                            <ul>
                                                <li>Features</li>
                                            </ul>
                                        </div>
                                    </div>
                                </label>
                                <div class="refact-welcome__actions">
                                    <button data-target="personal" class="refact-welcome__back">&lsaquo;&nbsp;&nbsp;Back</button>
                                    <button class="refact-welcome__next refact-welcome__nextprov">Next&nbsp;&nbsp;&rsaquo;</button>
                                </div>
                            </div>
                        </div>

                        <div data-provider="huggingface" class="refact-welcome__subpanel">
                            <h2>Huggingface Cloud</h2>
                            <div>
                                <label class="refact-welcome__label">API Key</label>
                                <input class="refact-welcome__apikey_hf refact-welcome__input" type="text" name="api_key" value="${api_key}">
                            </div>
                            <div class="refact-welcome__hflink">You can view your API key at <a href="x" class="refact-welcome__hf_open_tokens">https://huggingface.co/settings/tokens</a></div>
                            <div class="refact-welcome__actions">
                                <button data-target="huggingface" class="refact-welcome__back">&lsaquo;&nbsp;&nbsp;Back</button>
                                <button class="refact-welcome__next refact-welcome__next_hf">Next&nbsp;&nbsp;&rsaquo;</button>
                            </div>
                        </div>

                        <div data-provider="refact" class="refact-welcome__subpanel">
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
                        <div class="sidebar-buttons">
                            <div></div>
                            <button tabindex="-1" id="chat"><span></span>New Chat</button>
                            <button tabindex="-1" id="history"><span></span>Chat History</button>
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
                    <script nonce="${nonce}" src="${scriptUri}"></script>
                </body>
                </html>`;
    }

    private _getHtmlForHistoryWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(
          vscode.Uri.joinPath(
            this._context.extensionUri,
            "assets",
            "chat_history.js"
          )
        );
        const styleMainUri = webview.asWebviewUri(
          vscode.Uri.joinPath(
            this._context.extensionUri,
            "assets",
            "chat_history.css"
          )
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
          <div id="sidebar" class="sidebar">
            <div id="back_button">Back</div>
            <div class="chat-history-list"></div>
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
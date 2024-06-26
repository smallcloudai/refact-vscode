/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as estate from "./estate";
import * as userLogin from "./userLogin";
import * as chatTab from './chatTab';
import * as statisticTab from './statisticTab';
import * as fimDebug from './fimDebug';
import { get_caps } from "./fetchAPI";
import ChatHistoryProvider from "./chatHistory";
import { Chat } from "./chatHistory";
import * as crlf from "./crlf";
import { v4 as uuidv4 } from "uuid";
import {
	EVENT_NAMES_FROM_CHAT,
	EVENT_NAMES_FROM_STATISTIC,
	FIM_EVENT_NAMES,
} from "refact-chat-js/dist/events";
import { getKeyBindingForChat } from "./getKeybindings";

type Handler = ((data: any) => void) | undefined;
function composeHandlers(...eventHandlers: Handler[]) {
    return (data: any) => eventHandlers.forEach(fn => fn && fn(data));
}

export async function open_chat_tab(
    question: string,
    editor: vscode.TextEditor | undefined,
    attach_default: boolean,   // checkbox set on start, means attach the current file
    model: string,
    messages: [string, string][],
    chat_id: string,
    append_snippet_to_input: boolean = false,
): Promise<chatTab.ChatTab|undefined> {
    if (global.side_panel?.chat) {
        global.side_panel.chat = null;
    }

    if (global.side_panel && global.side_panel._view) {
        // TODO: check this
        let chat: chatTab.ChatTab = global.side_panel.new_chat(global.side_panel._view, chat_id);

        let context: vscode.ExtensionContext | undefined = global.global_context;
        if (!context) {
            return;
        }
        global.side_panel.goto_chat(chat);  // changes html
        await chatTab.ChatTab.clear_and_repopulate_chat(
            question,
            editor,
            attach_default,
            model,
            messages,
            append_snippet_to_input,
        );
        return chat;
    }
    return;
}

export async function open_statistic_tab(): Promise<statisticTab.StatisticTab|undefined> {
    if (global.side_panel && global.side_panel._view) {
        let stat = global.side_panel.new_statistic(global.side_panel._view);

        let context: vscode.ExtensionContext | undefined = global.global_context;
        if (!context) {
            return;
        }
        global.side_panel.goto_statistic(stat);  // changes html
    }
    return;
}

export async function open_fim_debug(): Promise<void> {
    if (global.side_panel && global.side_panel._view) {
        let fim = global.side_panel.new_fim_debug(global.side_panel._view);

        let context: vscode.ExtensionContext | undefined = global.global_context;
        if (!context) {
            return;
        }

        global.side_panel.goto_fim(fim);
    }
    return;
}

export class PanelWebview implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _history: string[] = [];
    selected_lines_count: number = 0;
    access_level: number = -1;
    cancel_token: vscode.CancellationToken | undefined = undefined;
    public address: string;

    public chat: chatTab.ChatTab | null = null;
    public statistic: statisticTab.StatisticTab | null = null;
    public fim_debug: fimDebug.FimDebug | null = null;
    public chatHistoryProvider: ChatHistoryProvider|undefined;

    public static readonly viewType = "refactai-toolbox";

    constructor(private readonly _context: any) {
        this.chatHistoryProvider = undefined;
        this.address = "";
        this.js2ts_message = this.js2ts_message.bind(this);
    }

    handleEvents(data: any) {
        if(!this._view) { return; }
        return composeHandlers(this.chat?.handleEvents, this.js2ts_message)(data);
    }

    public make_sure_have_chat_history_provider()
    {
        if (!this.chatHistoryProvider) {
            this.chatHistoryProvider = new ChatHistoryProvider(
                this._context,
            );
        }
        return this.chatHistoryProvider;
    }

    public new_chat(view: vscode.WebviewView, chat_id: string)
    {
        if (chat_id === "" || chat_id === undefined) {
            chat_id = uuidv4();
        }
        this.chat = new chatTab.ChatTab(view, this.make_sure_have_chat_history_provider(), chat_id);
        this.address = chat_id;
        return this.chat;
    }

    public new_statistic(view: vscode.WebviewView)
    {
        this.statistic = new statisticTab.StatisticTab(view);
        return this.statistic;
    }

    public new_fim_debug(view: vscode.WebviewView) {
        this.fim_debug = new fimDebug.FimDebug(view);
        return this.fim_debug;
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
            this.handleEvents(data);
        });
    }

    public async goto_main()
    {
        this.address = "";
        if (!this._view) {
            return;
        }
        this._view.webview.html = await this.html_main_screen(this._view.webview);
        this.update_webview();
    }

    public goto_chat(chat: chatTab.ChatTab)
    {
        this.address = chat.chat_id;
        if (!this._view) {
            return;
        }
        this._view.webview.html = chat.get_html_for_chat(
            this._view.webview,
            this._context.extensionUri
        );
        this.update_webview();
    }

    public goto_statistic(statistic: statisticTab.StatisticTab)
    {
        if (!this._view) {
            return;
        }
        this._view.webview.html = statistic.get_html_for_statistic(
            this._view.webview,
            this._context.extensionUri,
        );
        this.update_webview();
    }

    public goto_fim(fim: fimDebug.FimDebug) {
        if (!this._view) { return; }
        this._view.webview.html = fim.get_html(
            this._view.webview,
            this._context.extensionUri
        );
        this.update_webview();
    }

    public update_chat_history()
    {
        const history = this.make_sure_have_chat_history_provider().chats_sorted_by_time();
        if (this._view) {
            this._view.webview.postMessage({
                command: "loadHistory",
                history: history,
            });
        }
    }

    public async delete_old_settings()
    {
        await vscode.workspace.getConfiguration().update('refactai.apiKey', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration().update('refactai.addressURL', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration().update('codify.apiKey', undefined, vscode.ConfigurationTarget.Global);
        if(vscode.workspace.workspaceFolders) {
            await vscode.workspace.getConfiguration().update('refactai.apiKey', undefined, vscode.ConfigurationTarget.Workspace);
            await vscode.workspace.getConfiguration().update('refactai.addressURL', undefined, vscode.ConfigurationTarget.Workspace);
            await vscode.workspace.getConfiguration().update('codify.apiKey', undefined, vscode.ConfigurationTarget.Workspace);
        }
    }

    public async js2ts_message(data: any)
    {
        if (!this._view) {
            return;
        }
        // console.log(`RECEIVED JS2TS: ${JSON.stringify(data)}`);
        switch (data.type) {
        case EVENT_NAMES_FROM_CHAT.OPEN_IN_CHAT_IN_TAB:
        case "open_chat_in_new_tab": {
            const chat_id = data?.chat_id || this.chat?.chat_id;
            // const chat_id = data.payload.id;
            if(!chat_id || typeof chat_id !== "string") {return; }
            if(!this.chatHistoryProvider) { return; }

            const openTab = global.open_chat_tabs?.find(tab => tab.chat_id === chat_id);
            if(openTab) {
                return openTab.focus();
            }
            // is extensionUri defined anywhere?
            await chatTab.ChatTab.open_chat_in_new_tab(this.chatHistoryProvider, chat_id, this._context.extensionUri, true);
            this.chat = null;
            return this.goto_main();
        }
        case "focus_back_to_editor": {
            vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
            break;
        }

        case "open_new_chat": {
            let question = data.question;
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
                [],      // messages
                "",      // chat id
                true,
            );
            break;
        }
        case "open_statistic": {
            await open_statistic_tab();
            break;
        }
        case "delete_chat": {
            const chat_id = data.chat_id;
            await this.make_sure_have_chat_history_provider().delete_chat(chat_id);
            break;
        }
        case "button_hf_open_tokens": {
            vscode.env.openExternal(vscode.Uri.parse(`https://huggingface.co/settings/tokens`));
            break;
        }
        case "button_hf_save": {
            await this.delete_old_settings();
            await vscode.workspace.getConfiguration().update('refactai.addressURL', "HF", vscode.ConfigurationTarget.Global);
            await vscode.workspace.getConfiguration().update('refactai.apiKey', data.hf_api_key, vscode.ConfigurationTarget.Global);
            break;
        }
        case "button_refact_save": {
            await this.delete_old_settings();
            await vscode.workspace.getConfiguration().update('refactai.addressURL', "Refact", vscode.ConfigurationTarget.Global);
            await vscode.workspace.getConfiguration().update('refactai.apiKey', data.refact_api_key, vscode.ConfigurationTarget.Global);
            break;
        }
        case "button_refact_open_streamlined": {
            await this.delete_old_settings();
            await vscode.workspace.getConfiguration().update('refactai.addressURL', "Refact", vscode.ConfigurationTarget.Global);
            vscode.commands.executeCommand('refactaicmd.login');
            break;
        }
        case "save_enterprise": {
            await this.delete_old_settings();
            await vscode.workspace.getConfiguration().update('refactai.addressURL', data.endpoint, vscode.ConfigurationTarget.Global);
            await vscode.workspace.getConfiguration().update('refactai.apiKey', data.apikey, vscode.ConfigurationTarget.Global);
            break;
        }
        case "save_selfhosted": {
            await this.delete_old_settings();
            await vscode.workspace.getConfiguration().update('refactai.addressURL', data.endpoint, vscode.ConfigurationTarget.Global);
            await vscode.workspace.getConfiguration().update('refactai.apiKey', 'any-will-work-for-local-server', vscode.ConfigurationTarget.Global);
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
            userLogin.inference_login_force_retry();
            await userLogin.inference_login();
            break;
        }
        case "openSettings": {
            vscode.commands.executeCommand("refactaicmd.openSettings");
            break;
        }
        case "openKeys": {
            vscode.commands.executeCommand("workbench.action.openGlobalKeybindings", "Refact.ai");
            break;
        }
        case "restore_chat": {
            const chat_id = data.chat_id;
            if (!chat_id) {
                break;
            }
            let editor = vscode.window.activeTextEditor;

            const caps = await get_caps();

            let chat: Chat | undefined = await this.make_sure_have_chat_history_provider().lookup_chat(chat_id);
            if (!chat) {
                console.log(`Chat ${chat_id} not found, cannot restore`);
                break;
            }

            const openTab = global.open_chat_tabs?.find(tab => tab.chat_id === chat_id);
            if(openTab) {
                return openTab.focus();
            } else {
                const model = caps.running_models.includes(chat.chatModel)
					? chat.chatModel
					: caps.code_chat_default_model;

                await open_chat_tab(
                    "",
                    editor,
                    true,
                    model,
                    chat.messages,
                    chat_id,
                );
            }
            break;
        }
        case "save_telemetry_settings": {
            await vscode.workspace.getConfiguration().update('refactai.telemetryCodeSnippets', data.code, vscode.ConfigurationTarget.Global);
            break;
        }
        case EVENT_NAMES_FROM_CHAT.BACK_FROM_CHAT:
        case EVENT_NAMES_FROM_STATISTIC.BACK_FROM_STATISTIC:
        case FIM_EVENT_NAMES.BACK:
        case "back-from-chat": {
            this.goto_main();
            this.chat = null;
            break;
        }

        case "fim_debug": {
            await open_fim_debug();
            break;
        }
        }
    }

    public update_webview()
    {
        if (!this._view) {
            return;
        }
        let have_key = !!userLogin.secret_api_key() && !!userLogin.get_address();
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
            ts2js_apikey: global.api_key,
            ts2js_plan: plan_msg,
            ts2js_metering_balance: global.user_metering_balance,
            ts2js_staging: vscode.workspace.getConfiguration().get('refactai.staging'),
            ts2js_stat_info: "stat inforamtion"
        });
    }

    private async html_main_screen(webview: vscode.Webview)
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
        let telemetry_code = '';
        if(vscode.workspace.getConfiguration().get('refactai.telemetryCodeSnippets')) {
            telemetry_code = 'checked';
        }
        let existing_address = vscode.workspace.getConfiguration().get("refactai.addressURL");
        if (typeof existing_address !== "string" || (typeof existing_address === "string" && !existing_address.match(/^https?:\/\//))) {
            existing_address = "";
        }

        const open_chat_hotkey = await getKeyBindingForChat();

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
                        <button tabindex="-1" id="chat-new">
                            <?xml version="1.0" ?>
                            <svg height="1657.973px" style="enable-background:new 0 0 1692 1657.973;" version="1.1" viewBox="0 0 1692 1657.973" width="1692px" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><g id="comment"><g><path d="M1216.598,1657.973c-15.035,0-29.926-4.822-41.984-14.746l-439.527-361.254H158.332    C71.515,1281.973,0,1209.012,0,1120.074V160.168C0,71.627,71.515,0.973,158.332,0.973h1374.836    c87.743,0,158.832,70.655,158.832,159.195v959.909c0,88.938-71.089,161.896-158.832,161.896H1282v309.93    c0,25.561-14.415,48.826-37.528,59.744C1235.479,1655.892,1226.173,1657.973,1216.598,1657.973z M158.332,132.973    c-13.953,0-25.332,11.52-25.332,27.195v959.906c0,15.805,11.615,29.898,25.332,29.898H758.77c15.311,0,29.89,4.95,41.715,14.674    L1150,1451.998v-236.699c0-36.49,30.096-65.326,66.586-65.326h316.582c14.123,0,26.832-14.639,26.832-29.896V160.168    c0-15.146-12.457-27.195-26.832-27.195H158.332z"/></g></g><g id="Layer_1"/></svg>
                            New&nbsp;Chat
                            <span class="sidebar__hotkey">${open_chat_hotkey}</span>
                        </button>
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
                                        <div class="refact-welcome__inlinewrap">
                                            <input type="radio" class="refact-welcome__radio" value="personal" name="account-type" />
                                            <span>Cloud</span>
                                        </div>
                                        <div class="refact-welcome__desc">
                                            <ul>
                                                <li>Easy to start</li>
                                                <li>Free tier</li>
                                                <li>You can opt-in for code snippets collection to help this open source project, off by default</li>
                                            </ul>
                                        </div>
                                    </div>
                                </label>

                                <label class="refact-welcome__select" data-type="self-hosting">
                                    <div class="refact-welcome__content">
                                        <div class="refact-welcome__inlinewrap">
                                            <input type="radio" class="refact-welcome__radio" value="self-hosting" name="account-type" />
                                            <span>Self-hosting</span>
                                        </div>
                                        <div class="refact-welcome__desc">
                                            <ul>
                                                <li>Uses your own server</li>
                                                <li>Your code never leaves your control</li>
                                            </ul>
                                        </div>
                                    </div>
                                </label>

                                <label class="refact-welcome__select" data-type="enterprise">
                                <div class="refact-welcome__content">
                                    <div class="refact-welcome__inlinewrap">
                                        <input type="radio" class="refact-welcome__radio" value="enterprise" name="account-type" />
                                        <span>Enterprise</span>
                                    </div>
                                    <div class="refact-welcome__desc">
                                        <ul>
                                            <li>Doesn't connect to a public cloud</li>
                                            <li>Uses your private server only</li>
                                            <li>Sends telemetry and code snippets to your private server</li>
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
                            <div classs="refact-welcome__note">You should have corporate endpoint URL and personal API key. Please contact your system administrator.</div>
                            <div>
                                <label class="refact-welcome__label">Endpoint Address</label>
                                <input class="refact-welcome__enterendpoint refact-welcome__input" placeholder="http://x.x.x.x:8008/" type="text" name="endpoint_address" value="${existing_address}">
                            </div>
                            <div>
                                <label class="refact-welcome__label">API Key</label>
                                <input class="refact-welcome__apikey_enterprise refact-welcome__input" type="text" name="api_key" value="${api_key}">
                            </div>
                            <div class="refact-welcome__error-enterprise">Please enter API key</div>
                            <div class="refact-welcome__actions">
                                <button data-target="enterprise" class="refact-welcome__back">&lsaquo;&nbsp;&nbsp;Back</button>
                                <button class="refact-welcome__savebutton refact-welcome__savebutton--enterprise">Save</button>
                            </div>
                        </div>

                        <div class="refact-welcome__personal refact-welcome__subscreen">
                            <h2>Cloud Inference</h2>
                            <div class="refact-welcome__or">Quick login via website:</div>
                            <button class="refact-welcome__refact">
                                Login / Create Account
                            </button>
                            <!--div class="refact-welcome__or">or</div-->
                            <div>
                                <label class="refact-welcome__label">Alternatively, paste an existing Refact API Key here:</label>
                                <input class="refact-welcome__apikey_refact refact-welcome__input" type="text" name="api_key" value="${api_key}">
                            </div>
                            <div class="refact-welcome__error-refact">Please Login / Create Account or enter API key</div>
                            <div class="refact-welcome__telemetry">
                                <p>Help Refact collect a dataset of corrected code completions!
                                This will help to improve code suggestions more to your preferences, and it also will improve code suggestions for everyone else.
                                Hey, we're not an evil corporation!</p>
                                <label><input class="refact-welcome__telemetrycode" type="checkbox" id="telemetrycode" name="telemetrycode" value="true" ${telemetry_code}>Send corrected code snippets.</label>
                                <p>Basic telemetry is always on when using cloud inference, but it only sends errors and counters.
                                <a href="https://github.com/smallcloudai/refact-lsp/blob/main/README.md#telemetry">How telemetry works in open source refact-lsp</a></p>
                            </div>
                            <div class="refact-welcome__actions">
                                <button data-target="refact" class="refact-welcome__back">&lsaquo;&nbsp;&nbsp;Back</button>
                                <button class="refact-welcome__next refact-welcome__next_refact">Next&nbsp;&nbsp;&rsaquo;</button>
                            </div>
                        </div>

                        <div class="refact-welcome__selfhosted refact-welcome__subscreen">
                            <div>
                                <div classs="refact-welcome__note">A great option for self-hosting is <a href="https://github.com/smallcloudai/refact/">Refact docker</a>.
                                It can serve completion and chat models, has graphical user interface to set it up, and it can fine-tune code on your codebase.
                                A typical endpoint address is http://127.0.0.1:8008/<br/>
                                But this plugin might work with a variety of servers, report your experience on discord!</div>
                                <label class="refact-welcome__label">Endpoint Address</label>
                                <input class="refact-welcome__endpoint refact-welcome__input" type="text" name="endpoint_address" value="${existing_address}">
                            </div>
                            <div class="refact-welcome__actions">
                                <button data-target="selfhosted" class="refact-welcome__back">&lsaquo;&nbsp;&nbsp;Back</button>
                                <button class="refact-welcome__savebutton refact-welcome__savebutton--selfhosted">Save</button>
                            </div>
                        </div>
                    </div>

                    <div class="sidebar-controls">
                        <div class="sidebar-controls-inner">
                            <div class="sidebar-inline sidebar-account">
                                <div class="sidebar-logged"><b><span></span></b></div>
                                <div class="sidebar-coins">
                                <div class="sidebar-coin"></div><span>0</span></div>
                            </div>
                            <div class="sidebar-inline">
                                <div class="sidebar-plan"><span></span><button class="sidebar-plan-button"></button></div>
                            </div>
                            <div class="sidebar-buttons">
                                <button tabindex="-1" id="logout" class=""><span></span>Logout</button>
                                <button tabindex="-1" id="fim-debug">FIM</button>
                                <button tabindex="-1" id="statistic"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path fill="rgba(255, 255, 255, 0.5)" d="M396.8 352h22.4c6.4 0 12.8-6.4 12.8-12.8V108.8c0-6.4-6.4-12.8-12.8-12.8h-22.4c-6.4 0-12.8 6.4-12.8 12.8v230.4c0 6.4 6.4 12.8 12.8 12.8zm-192 0h22.4c6.4 0 12.8-6.4 12.8-12.8V140.8c0-6.4-6.4-12.8-12.8-12.8h-22.4c-6.4 0-12.8 6.4-12.8 12.8v198.4c0 6.4 6.4 12.8 12.8 12.8zm96 0h22.4c6.4 0 12.8-6.4 12.8-12.8V204.8c0-6.4-6.4-12.8-12.8-12.8h-22.4c-6.4 0-12.8 6.4-12.8 12.8v134.4c0 6.4 6.4 12.8 12.8 12.8zM496 400H48V80c0-8.8-7.2-16-16-16H16C7.2 64 0 71.2 0 80v336c0 17.7 14.3 32 32 32h464c8.8 0 16-7.2 16-16v-16c0-8.8-7.2-16-16-16zm-387.2-48h22.4c6.4 0 12.8-6.4 12.8-12.8v-70.4c0-6.4-6.4-12.8-12.8-12.8h-22.4c-6.4 0-12.8 6.4-12.8 12.8v70.4c0 6.4 6.4 12.8 12.8 12.8z"/></svg></button>
                                <button tabindex="-1" id="privacy"><span></span></button>
                                <button tabindex="-1" id="settings"><i></i><span></span></button>
                                <button tabindex="-1" id="keys"><span></span></button>
                            </div>
                            <div class="sidebar-inline">
                                <button tabindex="-1" id="profile"><span></span>Your Account</button>
                                <button tabindex="-1" id="report_bugs"><span></span>Report Bug</button>
                                <button tabindex="-1" id="discord" class=""><span></span>Discord</button>
                            </div>
                        </div>
                    </div>
                </div>
                <script nonce="${nonce}" src="${scriptUri1}"></script>
                <script nonce="${nonce}" src="${scriptUri2}"></script>
                <script>
                    window.onload = function() {
                        const vscode = acquireVsCodeApi();
                        sidebar_general_script(vscode);
                        chat_history_script(vscode);
                    }
                </script>
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
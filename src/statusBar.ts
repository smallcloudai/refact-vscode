/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as userLogin from "./userLogin";
import * as privacy from "./privacy";
import { PrivacySettings } from './privacySettings';
import * as fetchH2 from 'fetch-h2';
import { RagStatus } from './fetchAPI';


let _website_message = "";
let _inference_message = "";


export function set_website_message(msg: string)
{
    _website_message = msg;
}


export function set_inference_message(msg: string)
{
    _inference_message = msg;
}

export class StatusBarMenu {
    menu: any = {};
    socketerror: boolean = false;
    socketerror_msg: string = '';
    spinner: boolean = false;
    ast_warning: boolean = false;
    vecdb_warning: string = "";
    last_url: string = "";
    last_model_name: string = "";
    have_completion_success: boolean = false;
    access_level: number = -1;
    rag_status: string = "";
    rag_tootip: string = "";

    createStatusBarBlock(context: vscode.ExtensionContext)
    {
        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        item.command = "refactaicmd.statusBarClick";

        context.subscriptions.push(item);
        item.text = `$(codify-logo) Refact.ai`;
        item.tooltip = `Settings`;
        item.show();

        this.menu = item;

        return this.menu;
    }

    choose_color()
    {
        if (this.access_level === 0) {
            this.menu.text = `$(refact-icon-privacy) Refact.ai`;
            this.menu.backgroundColor = undefined;
            this.menu.tooltip = `Refact can't access this file because of the privacy rules`;
        } else if (this.socketerror) {
            this.menu.text = `$(debug-disconnect) Refact.ai`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            if (this.socketerror_msg.indexOf("no model") !== -1) {
                this.menu.tooltip = `Either an outage on the server side, or your settings might be outdated:\n${this.socketerror_msg}`;
            } else {
                this.menu.tooltip = `Cannot reach the server:\n` + this.socketerror_msg;
            }
        } else if (!global.have_caps) {
            this.menu.text = `$(codify-logo) Refact.ai`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            let reach = global.rust_binary_blob ? global.rust_binary_blob.attemping_to_reach() : "";
            this.menu.tooltip = `Inference server is currently unavailable\nAttempting to reach '${reach}'`;
        } else if (this.spinner) {
            this.menu.text = `$(sync~spin) Refact.ai`;
            this.menu.backgroundColor = undefined;
        } else if (this.ast_warning) {
            this.menu.text = `$(debug-disconnect) Files limit`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.menu.tooltip = "Click to make changes in settings";
        } else if (this.vecdb_warning !== '') {
            this.menu.text = `$(debug-disconnect) Refact.ai`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.menu.tooltip = this.vecdb_warning;
        } else if (this.have_completion_success) {
            this.menu.text = this.rag_status || `$(codify-logo) Refact.ai`;
            this.menu.backgroundColor = undefined;
            let msg: string = "";
            let reach = global.rust_binary_blob ? global.rust_binary_blob.attemping_to_reach() : "";
            if (reach) {
                msg += `Communicating with:\n 🌩️ ${reach}`;
            }
            if (this.last_model_name) {
                if (msg) {
                    msg += "\n\n";
                }
                msg += `Last used model:\n 🧠 ${this.last_model_name}`;
            }
            if (this.rag_tootip) {
                if (msg) {
                    msg += "\n\n";
                }
                msg += `${this.rag_tootip}`;
            }
            if (_website_message || _inference_message) {
                msg += "\n\n";
                msg += _website_message || _inference_message;
            }
            this.menu.tooltip = msg;
        } else if (!userLogin.secret_api_key()) {
            this.menu.text = `$(account) Refact.ai`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            this.menu.tooltip = _website_message || `Click to login`;
        } else {
            this.menu.text = this.rag_status || `$(codify-logo) Refact.ai`;
            this.menu.backgroundColor = undefined;
            let reach = global.rust_binary_blob ? global.rust_binary_blob.attemping_to_reach() : "";
            this.menu.tooltip = _website_message || _inference_message || `Refact Plugin\nCommunicating with server '${reach}'`;
            if (this.rag_tootip) {
                this.menu.tooltip += `\n\n${this.rag_tootip}`;
            }
        }
    }

    statusbar_spinner(on: boolean)
    {
        this.spinner = on;
        this.choose_color();
    }

    set_socket_error(error: boolean, detail: string|undefined)
    {
        this.socketerror = error;
        if (typeof detail === "string") {
            if (detail.length > 100) {
                detail = detail.substring(0, 100) + "...";
            }
            if (detail !== "{}") {
                this.socketerror_msg = `${detail}`;
            } else {
                this.socketerror_msg = "";
            }
        } else {
            this.socketerror_msg = "";
        }
        if (this.socketerror) {
            this.last_model_name = "";
        }
        if (error) {
            this.have_completion_success = false;
        }
        this.choose_color();
    }

    set_access_level(state: number)
    {
        this.access_level = state;
        this.choose_color();
    }

    completion_model_worked(model_name: string)
    {
        this.last_model_name = model_name;
        this.have_completion_success = true;
        this.choose_color();
    }

    ast_status_limit_reached(count: number, limit: number) {
        this.ast_warning = true;
        this.choose_color();
    }

    vecdb_error(error: string) {
        this.vecdb_warning = error;
        this.choose_color();
    }

    update_rag_status(status: RagStatus)
    {
        this.rag_status = '';
        if (status.vecdb && !["done", "idle"].includes(status.vecdb.state)) {
            const vecdb_parsed_qty = status.vecdb.files_total - status.vecdb.files_unprocessed;
            this.rag_status = `$(sync~spin) VecDB ${vecdb_parsed_qty}/${status.vecdb.files_total}`;
        }
        if (status.ast && !["done", "idle"].includes(status.ast.state)) {
            if (status.ast.state === "parsing") {
                const ast_parsed_qty = status.ast.files_total - status.ast.files_unparsed;
                this.rag_status = `$(sync~spin) Parsing ${ast_parsed_qty}/${status.ast.files_total} `;
            } else if (status.ast.state === "indexing") {
                this.rag_status = `$(sync~spin) Indexing AST`;
            } else if (status.ast.state === "starting") {
                this.rag_status = `$(sync~spin) Starting`;
            }
        }

        let rag_tootip = '';
        if (status.ast) {
            rag_tootip +=
                `AST files: ${status.ast.ast_index_files_total}\n` +
                `AST symbols: ${status.ast.ast_index_symbols_total}\n\n`
            ;
        } else {
            rag_tootip += "AST turned off\n\n";
        }
        if (status.vecdb) {
            rag_tootip +=
                `VecDB Size: ${status.vecdb.db_size}\n` +
                `VecDB Cache: ${status.vecdb.db_cache_size}\n` +
                `VecDB this session API calls: ${status.vecdb.requests_made_since_start}\n` +
                `VecDB this session vectors requested: ${status.vecdb.vectors_made_since_start}\n\n`
            ;
        } else {
            rag_tootip += "VecDB turned off\n\n";
        }
        this.rag_tootip = rag_tootip.trim();

        this.choose_color();
    }
}


async function on_change_active_editor(editor: vscode.TextEditor | undefined)
{
    if (!editor) {
        global.status_bar.set_access_level(-1);
        PrivacySettings.update_webview(PrivacySettings._panel);
        return;
    }
    let document_filename = editor.document.fileName;
    let access_level = await privacy.get_file_access(document_filename);
    global.status_bar.set_access_level(access_level);
}


export function status_bar_init()
{
    let disposable6 = vscode.window.onDidChangeActiveTextEditor(on_change_active_editor);
    let current_editor = vscode.window.activeTextEditor;
    if (current_editor) {
        on_change_active_editor(current_editor);
    }
    return [disposable6];
}

export async function send_network_problems_to_status_bar(
    positive: boolean,
    scope: string,
    related_url: string,
    error_message: string | any,
    model_name: string | undefined,
) {
    let invalid_session = false;
    let timedout = false;
    let conn_refused = false;
    if (typeof error_message !== "string") {
        if (error_message.code && error_message.code.includes("INVALID_SESSION")) {
            invalid_session = true;
        }
        if (error_message.code && error_message.code.includes("ETIMEDOUT")) {
            timedout = true;
        }
        if (error_message.code && error_message.code.includes("ECONNREFUSED")) {
            conn_refused = true;
        }
        if (error_message instanceof Error && error_message.message) {
            error_message = error_message.message;
        } else {
            error_message = JSON.stringify(error_message);
        }
    }
    if (typeof error_message === "string") {
        if (error_message.includes("INVALID_SESSION")) {
            invalid_session = true;
        }
        if (error_message.includes("ETIMEDOUT") || error_message.includes("timed out")) {
            timedout = true;
        }
        if (error_message.includes("ECONNREFUSED")) {
            conn_refused = true;
        }
    }
    if (!positive) {
        global.side_panel?.chat?.handleStreamEnd();
        await fetchH2.disconnectAll();
    } else {
        global.last_positive_result = Date.now();
    }
    if (invalid_session || conn_refused) {
        userLogin.inference_login_force_retry();
        console.log(["INVALID_SESSION, ECONNREFUSED => inference_login_force_retry"]);
    }
    if (timedout) {
        userLogin.inference_login_force_retry();
        // console.log(["ETIMEDOUT => disconnectAll"]);
    }
    if (error_message.length > 200) {
        error_message = error_message.substring(0, 200) + "…";
    }
    // if (model_name) {
    //     global.status_bar.url_and_model_worked(related_url, model_name);
    // }
    global.status_bar.set_socket_error(!positive, error_message);
    // if (global.side_panel) {
    //     global.side_panel.update_webview();
    // }
    // global.status_bar.url_and_model_worked("", "");
}

export default StatusBarMenu;

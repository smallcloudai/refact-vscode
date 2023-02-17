/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as userLogin from "./userLogin";
import * as estate from './estate';
import * as privacy from "./privacy";
import { PrivacySettings } from './privacySettings';


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
    command: string = 'plugin-vscode.statusBarClick';
    socketerror: boolean = false;
    socketerror_msg: string = '';
    spinner: boolean = false;
    last_url: string = "";
    last_model_name: string = "";
    inference_attempted: boolean = false;
    access_level: number = 0;
    // disable_lang: boolean = true;
    // language_name: string = "";

    createStatusBarBlock(context: vscode.ExtensionContext)
    {
        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        item.command = this.command;

        context.subscriptions.push(item);
        item.text = `$(codify-logo) codify`;
        item.tooltip = `Settings`;
        item.show();

        this.menu = item;

        return this.menu;
    }

    choose_color()
    {
        console.log("choose_color",this.access_level);
        if (this.access_level === 0) {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.menu.tooltip = `Access Level 0`;
        } else if (this.access_level === 1) {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = undefined;
            this.menu.tooltip = `Access Level 1`;
        } else if (this.access_level === 2) {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = undefined;
            this.menu.tooltip = `Access Level 2`;
        } else if (this.socketerror) {
            this.menu.text = `$(debug-disconnect) codify`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            if (this.socketerror_msg.indexOf("no model") !== -1) {
                this.menu.tooltip = `Either an outage on the server side, or your settings might be outdated:\n${this.socketerror_msg}`;
            } else {
                this.menu.tooltip = `Cannot reach the server:\n` + this.socketerror_msg;
            }
        } else if (this.spinner) {
            this.menu.text = `$(sync~spin) codify`;
            this.menu.backgroundColor = undefined;
        } else if (this.inference_attempted) {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = undefined;
            let msg: string = "";
            if (this.last_url) {
                msg += `⚡ ${this.last_url}`;
            }
            if (this.last_model_name) {
                if (msg) {
                    msg += "\n";
                }
                msg += `🗒️ ${this.last_model_name}`;
            }
            // if (this.language_name) {
            //     if (msg) {
            //         msg += "\n";
            //     }
            //     msg += `Click to disable Codify for "${this.language_name}"`;
            // }
            if (_website_message || _inference_message) {
                msg += "\n";
                msg += _website_message || _inference_message;
            }
            this.menu.tooltip = msg;
        } else if (!userLogin.check_if_login_worked()) { // condition here must be the same as in status_bar_clicked()
            this.menu.text = `$(account) codify`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            this.menu.tooltip = _website_message || `Click to login`;
        } else {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = undefined;
            this.menu.tooltip = _website_message || _inference_message;
        }
    }

    statusbarLoading(spinner: boolean)
    {
        this.spinner = spinner;
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
        this.choose_color();
    }

    // set_language_enabled(state: boolean, language_name: string)
    // {
    //     this.disable_lang = state;
    //     this.language_name = language_name;
    //     this.choose_color();
    // }

    set_access_level(state: number)
    {
        this.access_level = state;
        this.choose_color();
    }

    url_and_model_worked(url: string, model_name: string)
    {
        this.last_url = url;
        this.last_model_name = model_name;
        this.inference_attempted = url !== "";
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
    // global.status_bar.choose_color();
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


export default StatusBarMenu;

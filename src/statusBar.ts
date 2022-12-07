/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as userLogin from "./userLogin";
import * as estate from './estate';


 export class StatusBarMenu {
    menu: any = {};
    command: string = 'plugin-vscode.statusBarClick';
    socketerror: boolean = false;
    socketerror_msg: string = '';
    disable_lang: boolean = true;
    spinner: boolean = false;
    language_name: string = "";
    last_url: string = "";
    last_model_name: string = "";
    inference_attempted: boolean = false;

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
        if (this.disable_lang && this.language_name) {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.menu.tooltip = `Codify is not enabled for "${this.language_name}"`;
        } else if (this.socketerror) {
            this.menu.text = `$(debug-disconnect) codify`;
            this.menu.backgroundColor = undefined;
            if (this.socketerror_msg.indexOf("no model") !== -1) {
                this.menu.tooltip = `Either an outage on the server side, or your settings might be outdated:\n${this.socketerror_msg}`;
            } else {
                this.menu.tooltip = `Cannot reach the Codify server:\n` + this.socketerror_msg;
            }
        } else if (this.spinner) {
            this.menu.text = `$(sync~spin) codify`;
            this.menu.backgroundColor = undefined;
        } else if (this.inference_attempted) {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = undefined;
            let msg: string = "";
            if (this.last_model_name) {
                msg += `Connection to server works well.\nLast used model:\n    ${this.last_model_name}`;
            }
            if (this.last_url) {
                if (msg) {
                    msg += "\n";
                }
                msg += `Last used URL:\n    ${this.last_url}`;
            }
            if (this.language_name) {
                if (msg) {
                    msg += "\n";
                }
                msg += `Click to disable Codify for "${this.language_name}"`;
            }
            this.menu.tooltip = msg;
        } else if (!(global.userLogged && userLogin.getApiKey())) {
            this.menu.text = `$(account) codify`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            this.menu.tooltip = `Please login to Codify`;
        } else {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = undefined;
            this.menu.tooltip = "";
        }
    }

    statusbarLoading(spinner: boolean)
    {
        this.spinner = spinner;
        this.choose_color();
    }

    statusbarSocketError(error: boolean, detail: string|undefined)
    {
        this.socketerror = error;
        if (typeof detail === "string") {
            if (detail.length > 100) {
                detail = detail.substring(0, 100) + "...";
            }
            this.socketerror_msg = `${detail}`;
        } else {
            this.socketerror_msg = "";
        }
        if (this.socketerror) {
            this.last_model_name = "";
        }
        this.choose_color();
    }

    statusbarLang(state: boolean, language_name: string)
    {
        this.disable_lang = state;
        this.language_name = language_name;
        this.choose_color();
    }

    url_and_model_worked(url: string, model_name: string)
    {
        this.last_url = url;
        this.last_model_name = model_name;
        this.inference_attempted = true;
        this.choose_color();
    }

    // apiError(msg: string)
    // {
    //     global.menu.statusbarError(true);
    //     global.userLogged = false;
    //     if (msg) {
    //         vscode.window.showErrorMessage(msg);
    //     }
    // }
}


function onChangeActiveEditor(editor: vscode.TextEditor | undefined)
{
    if (!editor) {
        global.menu.statusbarLang(true, "");
        global.lastEditor = false;
        return;
    }
    let document = editor.document;
    global.lastEditor = document;
    let language = estate.lang_name(document);
    if (!estate.is_lang_enabled(document)) {
        global.menu.statusbarLang(true, language);
    } else {
        global.menu.statusbarLang(false, language);
    }
}


export function status_bar_init()
{
    let disposable6 = vscode.window.onDidChangeActiveTextEditor(onChangeActiveEditor);
    let currentEditor = vscode.window.activeTextEditor;
    if (currentEditor) {
        onChangeActiveEditor(currentEditor);
    }
    return [disposable6];
}


export default StatusBarMenu;

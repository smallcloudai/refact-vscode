/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as userLogin from "./userLogin";
import * as estate from './estate';


 export class StatusBarMenu {
    menu: any = {};
    command: string = 'plugin-vscode.statusBarClick';
    socketerror: boolean = false;
    lang: boolean = true;
    spinner: boolean = false;
    language_name: string = "";

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
        const apiKey = userLogin.getApiKey();
        let guest = !(global.userLogged && apiKey);
        if (guest) {
            this.menu.text = `$(account) codify`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            this.menu.tooltip = `Please login to Codify`;
        } else if (this.socketerror) {
            this.menu.text = `$(debug-disconnect) codify`;
            this.menu.backgroundColor = undefined;
            this.menu.tooltip = `Cannot reach the Codify server`;
        } else if (this.lang && this.language_name) {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.menu.tooltip = `Codify is not enabled for "${this.language_name}"`;
        } else if (this.spinner) {
            this.menu.text = `$(sync~spin) codify`;
            this.menu.backgroundColor = undefined;
        } else {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = undefined;
            if (this.language_name) {
                this.menu.tooltip = `Click to disable Codify for "${this.language_name}"`;
            } else {
                this.menu.tooltip = "";
            }
        }
    }

    statusbarLoading(spinner: boolean)
    {
        this.spinner = spinner;
        this.choose_color();
    }

    statusbarSocketError(error: boolean, detail: any = undefined)
    {
        if (detail && typeof detail === "object") {
            detail = JSON.stringify(detail);
        }
        console.log(["SOCKETERROR", error, detail]);
        this.socketerror = error;
        this.choose_color();
    }

    statusbarLang(state: boolean, language_name: string)
    {
        this.lang = state;
        this.language_name = language_name;
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

/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';
import * as userLogin from "./userLogin";


export async function login_message()
{
    const header = "Please login";
    let selection = await vscode.window.showInformationMessage("Please login to Codify", "Login");
    if(selection === "Login") {
        vscode.commands.executeCommand('plugin-vscode.login');
    }
    global.menu.choose_color();
}


export async function welcome_message()
{
    // const header = "Welcome to Codify, please login to use our extension";
    let selection = await vscode.window.showInformationMessage("Welcome to Codify, please login to start using our extension", "Login");
    if(selection === "Login") {
        vscode.commands.executeCommand('plugin-vscode.login');
    }
    global.menu.choose_color();
}


export async function account_message(info: string, action: string, url: string)
{
    let selection = await vscode.window.showInformationMessage(
        info,
        action,
    );
    if (selection === action) {
        vscode.env.openExternal(vscode.Uri.parse(url));
    }
}

// export async function hints()
// {
//     const header = "Codify Hints";
//     const options: vscode.MessageOptions = { detail: 'Hint1: select some code, press F1 and tell how to change it, for example "convert to list comprehension"\n\nHint2: press F1 and type an instruction for the whole file, for example "fix typos" or "add type hints". The plugin will highlight all the places that the instruction is applicable to.\n\nHint3: press F1 again to regenerate changes.', modal: true };
//     vscode.window.showInformationMessage(header, options);
// }


export function checkAuth(context: any)
{
    let apiKey = getApiKey();
    let userName = global.userLogged;
    if (!userName || !apiKey) { return false; }
    return true;
}


export function getApiKey()
{
    const apiKey = vscode.workspace.getConfiguration().get('codify.apiKey');
    if(!apiKey) { return false; }
    return apiKey;
}


export function generateTicket(context: any)
{
    const store = context.globalState;
    let token = Math.random().toString(36).substring(2, 15) + '-' + Math.random().toString(36).substring(2, 15);
    return token;
}


export async function login()
{
    const apiKey = userLogin.getApiKey();
    if (global.userLogged && apiKey) {
        return "OK";
    }
    const url = "https://www.smallcloud.ai/v1/api-activate";
    let headers = {
        "Content-Type": "application/json",
        "Authorization": "",
    };
    const ticket = global.userTicket;
    if (ticket && !global.userLogged) {
        headers.Authorization = `codify-${ticket}`;
        // global.userTicket = "";
    } else {
        if (!global.userLogged && apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        } else {
            return "";
        }
    }
    let req = new fetchH2.Request(url, {
        method: "GET",
        headers: headers,
        redirect: "follow",
        cache: "no-cache",
        referrer: "no-referrer",
    });
    console.log(["LOGIN", headers.Authorization]);
    try {
        let result = await fetchH2.fetch(req);
        let json: any = await result.json();
        console.log(["login", result.status, json]);
        if (json.retcode === "TICKET-SAVEKEY") {
            await vscode.workspace.getConfiguration().update('codify.apiKey', json.secret_api_key, vscode.ConfigurationTarget.Global);
            await vscode.workspace.getConfiguration().update('codify.personalizeAndImprove', json.fine_tune, vscode.ConfigurationTarget.Global);
            global.userLogged = json.account;
            global.userTicket = "";
            if(global.panelProvider) {
                global.panelProvider.login_success();
            }
            global.menu.choose_color();
        } else if (json.retcode === 'OK') {
            global.userLogged = json.account;
            global.userTicket = "";
            if(global.panelProvider) {
                global.panelProvider.login_success();
            }
            global.menu.choose_color();
        } else if (json.retcode === 'FAILED') {
            global.menu.statusbarSocketError(true, `login error (1): ${json.human_readable_message}`);
            return "";
        } else if (json.retcode === 'MESSAGE') {
            userLogin.account_message(json.human_readable_message, json.action, json.action_url);
        } else {
            global.menu.statusbarSocketError(true, `login error (2): unrecognized json`);
            return "";
        }
    } catch (error) {
        global.menu.statusbarSocketError(true, `login error (3): ${error}`);
        return "";
    }
    return "OK";
}

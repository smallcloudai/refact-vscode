/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';
import * as fetchAPI from "./fetchAPI";
import * as usageStats from "./usageStats";


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
    let apiKey = getApiKey();
    if (global.userLogged && getApiKey()) {
        return "OK";
    }
    let headers = {
        "Content-Type": "application/json",
        "Authorization": "",
    };
    let init: any = {
        method: "GET",
        headers: headers,
        redirect: "follow",
        cache: "no-cache",
        referrer: "no-referrer",
    };
    if (global.streamlined_login_ticket && !global.userLogged) {
        const recall_url = "https://www.smallcloud.ai/v1/streamlined-login-recall-ticket";
        headers.Authorization = `codify-${global.streamlined_login_ticket}`;
        try {
            let req = new fetchH2.Request(recall_url, init);
            let result = await fetchH2.fetch(req);
            let json: any = await result.json();
            if (json.retcode === "OK") {
                apiKey = json.secret_key;
                await vscode.workspace.getConfiguration().update('codify.apiKey', apiKey);
                usageStats.report_success_or_failure(true, "recall", recall_url, "", "");
                global.streamlined_login_ticket = "";
                // fall through
            } else {
                usageStats.report_success_or_failure(false, "recall (1)", recall_url, json, "");
                return;
            }
        } catch (error) {
            usageStats.report_success_or_failure(false, "recall (2)", recall_url, error, "");
            return;
        }
    }
    if (!apiKey) {
        // wait until user clicks the login button
        return;
    }
    const login_url = "https://www.smallcloud.ai/v1/login";
    headers.Authorization = `Bearer ${apiKey}`;
    try {
        let req = new fetchH2.Request(login_url, init);
        let result = await fetchH2.fetch(req);
        let json: any = await result.json();
        console.log(["login", result.status, json]);
        if (json.retcode === "OK") {
            global.userLogged = json.account;
            fetchAPI.save_url_from_login(json.inference_url);
            if (global.panelProvider) {
                global.panelProvider.login_success();
            }
            usageStats.report_success_or_failure(true, "login", login_url, "", "");
        } else if (json.retcode === 'FAILED') {
            usageStats.report_success_or_failure(false, "login (1)", login_url, json.retcode, "");
            return "";
        } else if (json.retcode === 'MESSAGE') {
            account_message(json.human_readable_message, json.action, json.action_url);
        } else {
            usageStats.report_success_or_failure(false, "login (2)", login_url, "unrecognized response", "");
            return "";
        }
    } catch (error) {
        usageStats.report_success_or_failure(false, "login (3)", login_url, error, "");
        return "";
    }
    return "OK";
}

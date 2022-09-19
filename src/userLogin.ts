/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';


export async function login_message()
{
    const header = "Please login";
    let selection = await vscode.window.showInformationMessage("Please login to Codify", "Login");
    if(selection === "Login") {
        vscode.commands.executeCommand('plugin-vscode.login');
    }
    global.menu.choose_color();
}


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

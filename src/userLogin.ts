/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';
import * as usabilityHints from "./usabilityHints";
import * as statusBar from "./statusBar";


export function get_address(): string
{
    let addr1: string|undefined = vscode.workspace.getConfiguration().get("refactai.addressURL");
    let addr2: string|undefined = vscode.workspace.getConfiguration().get("refactai.infurl");  // old name
    return addr1 || addr2 || "";
}


export async function login_message()
{
    await vscode.commands.executeCommand('workbench.view.extension.refact-toolbox-pane');
}


export async function welcome_message()
{
    await vscode.commands.executeCommand('workbench.view.extension.refact-toolbox-pane');
    await new Promise(resolve => setTimeout(resolve, 1000));
    await vscode.commands.executeCommand('workbench.view.extension.refact-toolbox-pane');
    let selection = await vscode.window.showInformationMessage("Welcome to Refact.ai!\nConnect to AI inference server in sidebar.");
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


export function secret_api_key(): string
{
    let key = vscode.workspace.getConfiguration().get('refactai.apiKey');
    if (!key) {
        // Backward compatibility: codify is the old name
        key = vscode.workspace.getConfiguration().get('codify.apiKey');
    }
    if (!key) { return ""; }
    if (typeof key !== 'string') { return ""; }
    return key;
}

/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';


export async function show_message_from_server(kind_of_message: string, msg: string)
{
    // Show a message from the server, but only once.
    let context_: vscode.ExtensionContext | undefined = global.global_context;
    if (context_ === undefined) {
        return false;
    }
    let context = context_ as vscode.ExtensionContext;
    let already_seen = context.globalState.get<string>(`refactai.servermsg${kind_of_message}`);
    if (already_seen === undefined) {
        already_seen = "";
    }
    if (already_seen === msg) {
        return false;
    }
    if (msg === "") {
        return false;
    }
    await context.globalState.update(`refactai.servermsg${kind_of_message}`, msg);
    let selection = await vscode.window.showInformationMessage(msg, "OK");
}

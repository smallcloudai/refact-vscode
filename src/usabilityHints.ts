/* eslint-disable @typescript-eslint/naming-convention */
import { toPascalCase } from 'refact-chat-js/dist/events';
import * as vscode from 'vscode';

const HTML_TAG_A_REGULAR_EXPRESSION = /<a\s+href="([^"]+)">([^<]+)<\/a>/i;

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

    const message_match_link = msg.match(HTML_TAG_A_REGULAR_EXPRESSION);
    
    let message_text = msg;
    let link_label: string | undefined;
    let link_href: string | undefined;

    if (message_match_link) {
        link_href = message_match_link[1];
        link_label = message_match_link[2];
        message_text = msg.replace(HTML_TAG_A_REGULAR_EXPRESSION, link_label);
    }

    if (link_href && link_label) {
        const button_label = toPascalCase(link_label);
        vscode.window.showInformationMessage(
            message_text,
            button_label
        ).then((selection) => {
            if (selection === button_label && link_href) {
                try {
                    const uri = vscode.Uri.parse(link_href, true);
                    vscode.env.openExternal(uri)
                        .then(
                            success => {
                                if (!success) {
                                    vscode.window.showErrorMessage("Failed to open URL");
                                }
                            },
                            error => {
                                vscode.window.showErrorMessage(`Failed to open URL: ${error}`);
                            }
                        );
                } catch (error) {
                    console.error(error);
                    vscode.window.showErrorMessage(`Failed to open URL: ${error}`);
                }
            }
        });
    } else {
        vscode.window.showInformationMessage(msg);
    }

    await context.globalState.update(`refactai.servermsg${kind_of_message}`, msg);
}

/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as path from 'path';
import * as estate from "./estate";
import * as fetchH2 from 'fetch-h2';
import * as fetchAPI from "./fetchAPI";
import {
    type ChatMessage,
    setInputValue,
    isUserMessage,
    UserMessage,
} from "refact-chat-js/dist/events";


class ExperimentalLens extends vscode.CodeLens {
    public constructor(
        range: vscode.Range,
        msg: string,
        arg0: string,
        arg1: string,
    ) {
        super(range, {
            title: msg,
            command: 'refactaicmd.codeLensClicked',
            arguments: [arg0, arg1, range]
        });
    }
}

export let custom_code_lens: { [key: string]: any } | null = null;
export class LensProvider implements vscode.CodeLensProvider
{
    public notifyCodeLensesChanged: vscode.EventEmitter<void>;
    public onDidChangeCodeLenses?: vscode.Event<void>;

    constructor()
    {
        this.notifyCodeLensesChanged = new vscode.EventEmitter<void>();
        this.onDidChangeCodeLenses = this.notifyCodeLensesChanged.event;
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
    ): Promise<vscode.CodeLens[]>
    {
        const codeLensIsEnabled = vscode.workspace.getConfiguration("refactai").get<boolean>("codeLens") ?? true;
        if (!codeLensIsEnabled) {
            return [];
        }
        const debug = vscode.workspace.getConfiguration("refactai").get<boolean>("codeLensDebug") ?? false;
        let state = estate.state_of_document(document);
        if (!state) {
            return [];
        }

        let customization = await fetchAPI.get_prompt_customization();

        const url = fetchAPI.rust_url("/v1/code-lens");
        const request = new fetchH2.Request(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                uri: document.uri.toString(),
                debug: debug,
            }),
        });

        const response = await fetchH2.fetch(request);
        let lenses: vscode.CodeLens[] = [];
        if (response.status !== 200) {
            console.log([`${url} http status`, response.status]);

        } else if ("code_lens" in customization) {
            custom_code_lens = customization["code_lens"] as { [key: string]: any };
            const this_file_lens = await response.json();
            if ("detail" in this_file_lens) {
                console.log(["/v1/code-lens error", this_file_lens["detail"]]);
            }
            if ("code_lens" in this_file_lens) {
                for (let i = this_file_lens["code_lens"].length - 1; i >= 0; i--) {
                    let item = this_file_lens["code_lens"][i];
                    let range = new vscode.Range(item["line1"] - 1, 0, item["line2"] - 1, 0);
                    if (item["spath"] !== "") {
                        for (const [key, lensdict] of Object.entries(custom_code_lens)) {
                            lenses.push(new ExperimentalLens(range, lensdict["label"], `CUSTOMLENS:${key}`, item["spath"]));
                        }
                    } else if (item["debug_string"] !== "") {
                        lenses.push(new ExperimentalLens(range, item["debug_string"], "debug", ""));
                    } else {
                        console.log(["/v1/code-lens error", "no spath or debug_string"]);
                    }
                }
            }
        }

        if (state.diff_lens_pos < document.lineCount) {
            let range = new vscode.Range(state.diff_lens_pos, 0, state.diff_lens_pos, 0);
            lenses.push(new ExperimentalLens(range, "👍 Approve (Tab)", "APPROVE", ""));
            lenses.push(new ExperimentalLens(range, "👎 Reject (Esc)", "REJECT", ""));
            // lenses.push(new ExperimentalLens(range, "↻ Rerun \"" + estate.global_intent + "\" (F1)", "RERUN"));  // 🔃
        }

        state.completion_reset_on_cursor_movement = false;
        return lenses;
    }
}

const sendCodeLensToChat = (
    messages: ChatMessage[],
    relative_path: string,
    text: string,
    auto_submit: boolean = false
) => {
    if (!global?.side_panel?._view || !messages) {
        return;
    }

    const firstMessage = messages[0];
    const isOnlyOneUserMessage = messages.length === 1 && isUserMessage(firstMessage);
    const cursor = vscode.window.activeTextEditor?.selection.active.line ?? null;

    if (!isOnlyOneUserMessage) {
        const formattedMessages = formatMultipleMessagesForCodeLens(messages, relative_path, cursor, text);
        postMessageToWebview({
            messages: formattedMessages, send_immediately: auto_submit
        });
        return;
    }

    const messageBlock = createMessageBlock(firstMessage, relative_path, cursor, text);
    postMessageToWebview({
        value: messageBlock, send_immediately: auto_submit
    });
};

const postMessageToWebview = ({messages, value, send_immediately}: {messages?: ChatMessage[], value?: string, send_immediately: boolean}) => {
    if (!global.side_panel?._view) {
        return;
    };

    const eventMessage = setInputValue({
        messages,
        value,
        send_immediately
    });
    global.side_panel._view.webview.postMessage(eventMessage);
};

const replaceVariablesInText = (
    text: string,
    relative_path: string,
    cursor: number | null, 
    code_selection: string
) => {
    return text
        .replace("%CURRENT_FILE%", relative_path)
        .replace('%CURSOR_LINE%', cursor ? (cursor + 1).toString() : '')
        .replace("%CODE_SELECTION%", code_selection)
        .replace("%PROMPT_EXPLORATION_TOOLS%", '');
};

const createMessageBlock = (
    message: UserMessage,
    relative_path: string,
    cursor: number | null,
    text: string
) => {
    if (typeof message.ftm_content === 'string') {
        return replaceVariablesInText(message.ftm_content, relative_path, cursor, text);
    } else {
        return message.ftm_content.map(content => {
            if (('type' in content) && content.type === 'text') {
                return replaceVariablesInText(content.text, relative_path, cursor, text);
            }
        }).join("\n");
    }
};

const formatMultipleMessagesForCodeLens = (
    messages: ChatMessage[],
    relative_path: string,
    cursor: number | null,
    text: string
) => {
    return messages.map(message => {
        if (isUserMessage(message)) {
            if (typeof message.ftm_content === 'string') {
                return {
                    ...message,
                    content: replaceVariablesInText(message.ftm_content, relative_path, cursor, text)
                };
            }
        }
        return message;
    });
};

export async function code_lens_execute(code_lens: string, range: any) {
    if (!global) { return; }
    if (global.is_chat_streaming) { return; }
    global.is_chat_streaming = true;
    if (custom_code_lens) {
        const auto_submit = custom_code_lens[code_lens]["auto_submit"];
        const new_tab = custom_code_lens[code_lens]["new_tab"];
        let messages: ChatMessage[] = custom_code_lens[code_lens]["messages"];

        const start_of_line = new vscode.Position(range.start.line, 0);
        const end_of_line = new vscode.Position(range.end.line + 1, 0);
        const block_range = new vscode.Range(start_of_line, end_of_line);

        const file_path = vscode.window.activeTextEditor?.document.fileName || "";
        const workspaceFolders = vscode.workspace.workspaceFolders;
        let relative_path: string = "";

        if (workspaceFolders) {
            const workspacePath = workspaceFolders[0].uri.fsPath;
            relative_path = path.relative(workspacePath, file_path);
        }

        let text = vscode.window.activeTextEditor!.document.getText(block_range);

        if (messages.length === 0) {
            global.is_chat_streaming = false;
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            editor.selection = new vscode.Selection(start_of_line, end_of_line);
            editor.revealRange(block_range);
            vscode.commands.executeCommand('refactaicmd.callChat', '');
            return;
        }

        if (global && global.side_panel && global.side_panel._view && global.side_panel._view.visible) {
            const current_page = global.side_panel.context.globalState.get("chat_page");
            if (typeof current_page === "string" && current_page !== '"chat"' || new_tab) {
                vscode.commands.executeCommand('refactaicmd.callChat', '');
            }
            sendCodeLensToChat(messages, relative_path, text, auto_submit);
            if (!auto_submit) {
                global.is_chat_streaming = false;
            }
        } else {
            vscode.commands.executeCommand('refactaicmd.callChat', '');
            sendCodeLensToChat(messages, relative_path, text, auto_submit);
            if (!auto_submit) {
                global.is_chat_streaming = false;
            }
        }
    }
}


export var global_provider: LensProvider | null = null;


export function save_provider(provider: LensProvider)
{
    global_provider = provider;
}


export function quick_refresh()
{
    if (global_provider) {
        console.log(`[DEBUG]: refreshing code lens!`);
        global_provider.notifyCodeLensesChanged.fire();
    }
}

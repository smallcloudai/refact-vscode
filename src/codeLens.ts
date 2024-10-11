/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as path from 'path';
import * as estate from "./estate";
import * as fetchH2 from 'fetch-h2';
import * as fetchAPI from "./fetchAPI";
import { 
    type ChatMessages,
    type ChatMessage,
    type ToolUse,
    setInputValue,
} from "refact-chat-js/dist/events";
import { chat_model_get } from './chatTab';


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
            body: JSON.stringify({ uri: document.uri.toString() }),
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
                for (let item of this_file_lens["code_lens"]) {
                    let range = new vscode.Range(item["line1"] - 1, 0, item["line2"] - 1, 0);
                    for (const [key, lensdict] of Object.entries(custom_code_lens)) {
                        lenses.push(new ExperimentalLens(range, lensdict["label"], `CUSTOMLENS:${key}`, item["spath"]));
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

export async function code_lens_execute(code_lens: string, range: any) {
    if(custom_code_lens) {
        const auto_submit = custom_code_lens[code_lens]["auto_submit"];
        let messages: {content: string; role: string;}[] = custom_code_lens[code_lens]["messages"];
        console.log(`[DEBUG]: custorm_code_lens: `, custom_code_lens[code_lens]);
        
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

        const cursor_line = vscode.window.activeTextEditor?.selection.active.line ?? null;
        let text = vscode.window.activeTextEditor!.document.getText(block_range);

        let tools = await fetchAPI.get_tools();
        const tools_to_use = tools.filter(tool => tool.function.agentic !== true);
        console.log(`[DEBUG]: tools: `, tools);
        let [chat_model] = await chat_model_get();

        if (!auto_submit) {
            const sendCodeLensToChat = (global: typeof globalThis) => {
                if (!global || !global.side_panel || !global.side_panel._view) {
                    return;
                }

                const messageBlock = messages.find((message: {content: string; role: string;}) => message.role === "user")?.content
                    .replace("%CURRENT_FILE%", relative_path)
                    .replace("%CURSOR_LINE%", "")
                    .replace("%CODE_SELECTION%", text);
                
                const message = setInputValue(messageBlock ? messageBlock : text);
                global.side_panel._view.webview.postMessage(message);
            };
            
            
            if (messages.length === 0) {
                vscode.commands.executeCommand('refactaicmd.callChat', '');
                return;
            }

            if (global && global.side_panel && global.side_panel._view) {
                sendCodeLensToChat(global);
            } else {
                vscode.commands.executeCommand('refactaicmd.callChat', '');
                sendCodeLensToChat(global);
            }
        } else {
            let messages_data: ChatMessages = [];
            if (messages) {
                messages.forEach((message: { role: string; content: string; }) =>  {                        
                    const data: ChatMessage = {
                        content: message.content
                            .replace("%CURRENT_FILE%", file_path)
                            .replace("%CURSOR_LINE%", cursor_line !== null ? (cursor_line + 1).toString() : "")
                            .replace("%CODE_SELECTION%", text),
                        role: message.role as "user"
                    };
                    messages_data.push(data);
                });
            }
            const questionData = {
                id: '',
                model: chat_model,
                title: "",
                messages: messages_data,
                attach_file: false,
                tool_use: "explore" as ToolUse,
                tools: tools_to_use
            };
            console.log(`[DEBUG]: questionData: `, questionData);
            global.side_panel?.goto_chat(questionData);
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

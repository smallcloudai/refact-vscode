/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as fetchAPI from "./fetchAPI";
// import * as userLogin from "./userLogin";
import { marked } from 'marked'; // Markdown parser documentation: https://marked.js.org/
import ChatHistoryProvider from "./chatHistory";

export class ChatTab {
    // public static current_tab: ChatTab | undefined;
    // private _disposables: vscode.Disposable[] = [];
    public messages: [string, string][];
    public cancellationTokenSource: vscode.CancellationTokenSource;
    public working_on_attach_code: string = "";
    public working_on_snippet_code: string = "";
    public working_on_snippet_range: vscode.Range | undefined = undefined;
    public working_on_snippet_editor: vscode.TextEditor | undefined = undefined;
    public working_on_snippet_column: vscode.ViewColumn | undefined = undefined;
    public model_to_thirdparty: {[key: string]: boolean};
    public chatHistoryProvider: ChatHistoryProvider;
    public chatId: string = "";

    public get_messages(): [string, string][] {
        return this.messages;
    }

    public constructor(chatHistoryProvider: ChatHistoryProvider, chatId: string) {
        this.messages = [];
        this.model_to_thirdparty = {};
        this.cancellationTokenSource = new vscode.CancellationTokenSource();
        this.chatHistoryProvider = chatHistoryProvider;
        if (chatId === "" || chatId === undefined) {
            this.chatId = this.chatHistoryProvider.generateChatId();
        }
    }

    public static async activate_from_outside(
        question: string,
        editor: vscode.TextEditor | undefined,
        attach_default: boolean,
        use_model: string,
        messages: [string, string][],
    ) {
        let context: vscode.ExtensionContext | undefined = global.global_context;
        if (!context) {
            return;
        }

        let free_floating_tab = global.side_panel?.chat;
        if (!free_floating_tab) {
            console.log("no chat found!");
            return;
        }
        let code_snippet = "";
        free_floating_tab.working_on_snippet_range = undefined;
        free_floating_tab.working_on_snippet_editor = undefined;
        free_floating_tab.working_on_snippet_column = undefined;
        let fireup_message = {
            command: "chat-set-fireup-options",
            chat_attach_file: "",
            chat_attach_default: false,
        };
        if (editor) {
            let selection = editor.selection;
            let empty = selection.start.line === selection.end.line && selection.start.character === selection.end.character;
            if (!empty) {
                let last_line_empty = selection.end.character === 0;
                selection = new vscode.Selection(selection.start.line, 0, selection.end.line, last_line_empty ? 0 : 999999);
                code_snippet = editor.document.getText(selection);
                free_floating_tab.working_on_snippet_range = selection;
                free_floating_tab.working_on_snippet_editor = editor;
                free_floating_tab.working_on_snippet_column = editor.viewColumn;
            }
            let fn = editor.document.fileName;
            let short_fn = fn.replace(/.*[\/\\]/, "");
            fireup_message["chat_attach_file"] = short_fn;
            fireup_message["chat_attach_default"] = attach_default;
            let pos0 = selection.start;
            let pos1 = selection.end;
            let attach = "";
            while (1) {
                let attach_test = editor.document.getText(new vscode.Range(pos0, pos1));
                if (attach_test.length > 2000) {
                    break;
                }
                attach = attach_test;
                let moved = false;
                if (pos0.line > 0) {
                    pos0 = new vscode.Position(pos0.line - 1, 0);
                    moved = true;
                }
                if (pos1.line < editor.document.lineCount - 1) {
                    pos1 = new vscode.Position(pos1.line + 1, 999999);
                    moved = true;
                }
                if (!moved) {
                    break;
                }
            }
            free_floating_tab.working_on_attach_code = attach;
        }
        free_floating_tab.working_on_snippet_code = code_snippet;
        free_floating_tab.messages = messages;

        // This refills the chat
        global.side_panel?._view?.webview.postMessage({
            command: "chat-clear",
        });
        let messages_backup: [string, string][] = [];
        for (let i = 0; i < messages.length; i++) {
            let [role, content] = messages[i];
            let is_it_last_message = i === messages.length - 1;
            if (role === "user" && !is_it_last_message) {
                free_floating_tab._question_to_div(content, messages_backup);  // message inside
            }
            if (role === "assistant") {
                free_floating_tab._answer_to_div(content, messages_backup);  // message inside
            }
            messages_backup.push([role, content]);
        }

        if (messages.length > 0) {
            let last_message = messages[messages.length - 1];
            let [last_role, last_content] = last_message;
            if (last_role === "user") {
                let pass_dict = { command: "chat-set-question-text", value: {question: last_content} };
                global.side_panel?._view?.webview.postMessage(pass_dict);
            }
        } else {
            // fresh new chat, post code snippet if any
            let pass_dict = { command: "chat-set-question-text", value: {question: ""} };
            if (code_snippet) {
                pass_dict["value"]["question"] += "```\n" + code_snippet + "\n```\n";
            }
            if (question) {
                pass_dict["value"]["question"] += question;
            }
            global.side_panel?._view?.webview.postMessage(pass_dict);
        }
        global.side_panel?._view?.webview.postMessage(fireup_message);

        if (!use_model) {
            [use_model, ] = await chat_model_get();
        }
        let combo_populate_message = {
            command: "chat-models-populate",
            chat_models: [] as string[],
            chat_use_model: use_model,
        };
        await global.rust_binary_blob?.read_caps();
        for (let x of global.chat_models) {
            combo_populate_message["chat_models"].push(x);
        }
        global.side_panel?._view?.webview.postMessage(combo_populate_message);
    }

    // public dispose()
    // {
    //     ChatTab.current_tab = undefined;
    //     this.web_panel.dispose();
    //     while (this._disposables.length) {
    //         const disposable = this._disposables.pop();
    //         if (disposable) {
    //             disposable.dispose();
    //         }
    //     }
    // }

    public _question_to_div(question: string, messages_backup: [string, string][])
    {
        let valid_html = false;
        let html = "";
        try {
            html = marked.parse(question);
            valid_html = true;
        } catch (e) {
            valid_html = false;
        }
        if (!valid_html) {
            html = question;
        }
        global.side_panel?._view?.webview.postMessage({
            command: "chat-post-question",
            question_html: html,
            question_raw: question,
            messages_backup: messages_backup,
        });
    }

    public _answer_to_div(answer: string, messages_backup: [string, string][]) {
        let valid_html = false;
        let html = "";
        try {
          html = marked.parse(answer);
          valid_html = true;
        } catch (e) {
          valid_html = false;
        }
        if (!valid_html) {
          html = answer;
        }
        global.side_panel?._view?.webview.postMessage({
          command: "chat-post-answer",
          answer_html: html,
          answer_raw: answer,
          messages_backup: messages_backup,
        });
    }

    async chat_post_question(   // User presses Enter
        question: string,
        model: string,
        model_function: string,
        attach_file: boolean,
        restore_messages_backup: [string, string][],
    ) {
        if (!global.side_panel?._view) {
            return;
        }
        // let login = await userLogin.inference_login();
        // if (!login) {
        //     this.web_panel.webview.postMessage({
        //         command: "chat-post-answer",
        //         answer_html: "The inference server isn't working. Possible reasons: your internet connection is down, you didn't log in, or the Refact.ai inference server is currently experiencing issues.",
        //         answer_raw: "",
        //         have_editor: false,
        //     });
        //     return;
        // }
        console.log(`chat_post_question saved messages backup: ${restore_messages_backup.length}`);
        this.messages = restore_messages_backup;

        await chat_model_set(model, model_function);  // successfully used model, save it

        this.cancellationTokenSource = new vscode.CancellationTokenSource();
        let cancelToken = this.cancellationTokenSource.token;

        if (this.messages.length === 0) {
            // find first 15 characters, non space, non newline, non special character
            let first_normal_char_index = question.search(/[^ \n\r\t`]/);
            let first_40_characters = question.substring(first_normal_char_index, first_normal_char_index + 40);
            let first_41_characters = question.substring(first_normal_char_index, first_normal_char_index + 41);
            if (first_40_characters !== first_41_characters) {
                first_40_characters += "…";
            }
            // TODO
            global.side_panel._view.title = first_40_characters;  // change sideview title
            if (attach_file) {
                this.messages.push(["user", this.working_on_attach_code]);
                this.messages.push(["assistant", "Thanks for context, what's your question?"]);
            }
        }

        if (this.messages.length > 0 && this.messages[this.messages.length - 1][0] === "user") {
            this.messages.length -= 1;
        }

        let messages_backup = this.messages.slice();
        this.messages.push(["user", question]);
        // TODO: save history, not add
        await this.chatHistoryProvider.addMessageToChat(
            this.chatId,
            "user", question,
            model,
            model_function,
            global.side_panel._view.title || ""
        );
        if (this.messages.length > 10) {
            this.messages.shift();
            this.messages.shift(); // so it always starts with a user
        }
        this._question_to_div(question, messages_backup);
        global.side_panel?._view?.webview.postMessage({
            command: "chat-post-answer",
            answer_html: "⏳",
            answer_raw: "",
            have_editor: false,
            messages_backup: messages_backup,
        });
        await fetchAPI.wait_until_all_requests_finished();

        let answer = "";
        let stack_this = this;

        async function _streaming_callback(json: any)
        {
            if (typeof json !== "object") {
                return;
            }
            if (cancelToken.isCancellationRequested) {
                console.log(["chat request is cancelled, new data is coming", json]);
                return;
            } else {
                let delta = "";
                if (json["choices"]) {
                    let choice0 = json["choices"][0];
                    if (choice0["delta"]["role"] === "context") {
                        delta += 'Sources:<br>';
                        delta += '<ul>';
                        for (let r of choice0["delta"]["content"]["results"]) {
                            delta += `<li>* ${r["file_name"]}</li>`;
                        }
                        delta += '</ul>';
                    } else {
                        delta = choice0["delta"]["content"];
                    }
                }
                if (delta) {
                    answer += delta;
                    let valid_html = false;
                    let html = "";
                    try {
                        let raw_html = answer;
                        let backtick_backtick_backtick_count = (answer.match(/```/g) || []).length;
                        if (backtick_backtick_backtick_count % 2 === 1) {
                            raw_html = answer + "\n```";
                        }
                        html = marked.parse(raw_html);
                        valid_html = true;
                    } catch (e) {
                        valid_html = false;
                    }
                    if (valid_html) {
                        global.side_panel?._view?.webview.postMessage({
                            command: "chat-post-answer",
                            answer_html: html,
                            answer_raw: answer,
                            have_editor: Boolean(stack_this.working_on_snippet_editor),
                            messages_backup: messages_backup,
                        });
                    }
                }
                if (json["metering_balance"]) {
                    global.user_metering_balance = json["metering_balance"];
                    if (global.side_panel) {
                        global.side_panel.update_webview();
                    }
                }
            }
        }

        async function _streaming_end_callback(error_message: string)
        {
            // stack_this.web_panel.reveal();
            console.log("streaming end callback, error: " + error_message);
            if (error_message) {
                let backup_user_phrase = "";
                for (let i = stack_this.messages.length - 1; i < stack_this.messages.length; i++) {
                    if (i >= 0) {
                        if (stack_this.messages[i][0] === "user") {
                            backup_user_phrase = stack_this.messages[i][1];
                            stack_this.messages.length -= 1;
                            break;
                        }
                    }
                }
                console.log("backup_user_phrase:" + backup_user_phrase);
                global.side_panel?._view?.webview.postMessage({
                    command: "chat-error-streaming",
                    backup_user_phrase: backup_user_phrase,
                    error_message: error_message,
                });
            } else {
                stack_this.messages.push(["assistant", answer]);
                await stack_this.chatHistoryProvider.addMessageToChat(
                    stack_this.chatId,
                    "assistant", answer,
                    model,
                    model_function,
                    global.side_panel?._view?.title || ""
                );
                global.side_panel?._view?.webview.postMessage({ command: "chat-end-streaming" });
            }
        }

        let request = new fetchAPI.PendingRequest(undefined, cancelToken);
        request.set_streaming_callback(_streaming_callback, _streaming_end_callback);
        let third_party = true;
        third_party = this.model_to_thirdparty[model];

        request.supply_stream(...fetchAPI.fetch_chat_promise(
            cancelToken,
            "chat-tab",
            this.messages,
            model,
            third_party,
        ));
    }

    public get_html_for_chat(
        webview: vscode.Webview,
        extensionUri: any,
    ): string
    {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "assets", "chat.js")
        );
        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "assets", "chat.css")
        );
        const hlUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "assets", "hl.min.js")
        );

        const nonce = ChatTab.getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <!--
                    Use a content security policy to only allow loading images from https or from our extension directory,
                    and only allow scripts that have a specific nonce.
                -->
                <meta http-equiv="Content-Security-Policy" content="style-src ${webview.cspSource}; img-src 'self' data: https:; script-src 'nonce-${nonce}'; style-src-attr 'sha256-tQhKwS01F0Bsw/EwspVgMAqfidY8gpn/+DKLIxQ65hg=' 'unsafe-hashes';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">

                <title>Refact.ai Chat</title>
                <link href="${styleMainUri}" rel="stylesheet">
            </head>
            <body>
                <div class="refactcss-chat">
                    <button class="back-button">← Back</button>
                    <div class="refactcss-chat__wrapper">
                        <div class="refactcss-chat__inner">
                            <div class="refactcss-chat__content">
                                <div class="refactcss-chat__controls">
                                    <div><input type="checkbox" id="chat-attach" name="chat-attach"><label id="chat-attach-label" for="chat-attach">Attach file</label></div>
                                    <div class="refactcss-chat__model"><span>Use model:</span><select id="chat-model-combo"></select></div>
                                </div>
                            </div>
                            <div class="refactcss-chat__panel">
                                <div class="refactcss-chat__commands">
                                    <button id="chat-stop" class="refactcss-chat__stop"><span></span>Stop&nbsp;generating</button>
                                    <div id="chat-error-message"><span></span></div>
                                    <textarea id="chat-input" class="refactcss-chat__input"></textarea>
                                    <button id="chat-send" class="refactcss-chat__button"><span></span></button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <script nonce="${nonce}" src="${scriptUri}"></script>
                <script nonce="${nonce}" src="${hlUri}"></script>
                <script nonce="${nonce}">
                </script>
            </body>
            </html>`;
    }

    static getNonce()
    {
        let text = "";
        const possible =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}


export async function chat_model_get(): Promise<[string, string]>
{
    let context: vscode.ExtensionContext | undefined = global.global_context;
    if (!context) {
        return ["", ""];
    }
    let chat_model_ = await context.globalState.get("chat_model");
    let chat_model_function_ = await context.globalState.get("chat_model_function");
    let chat_model: string = "";
    if (typeof chat_model_ !== "string") {
        chat_model = "";
    } else {
        chat_model = chat_model_;
    }
    let chat_model_function: string = "";
    if (typeof chat_model_function_ !== "string") {
        chat_model_function = "";
    } else {
        chat_model_function = chat_model_function_;
    }
    return [chat_model, chat_model_function];
}

export async function chat_model_set(chat_model: string, model_function: string)
{
    let context: vscode.ExtensionContext | undefined = global.global_context;
    if (!context) {
        return;
    }
    if (!chat_model) {
        return;
    }
    await context.globalState.update("chat_model", chat_model);
    await context.globalState.update("chat_model_function", model_function);
}

export default ChatTab;
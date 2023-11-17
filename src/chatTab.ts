/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as fetchAPI from "./fetchAPI";
import ChatHistoryProvider from "./chatHistory";
// import * as userLogin from "./userLogin";
const Diff = require('diff');  // Documentation: https://github.com/kpdecker/jsdiff/
import { marked } from 'marked'; // Markdown parser documentation: https://marked.js.org/


export class ChatTab {
    // public static current_tab: ChatTab | undefined;
    // private _disposables: vscode.Disposable[] = [];
    public messages: [string, string][] = [];
    public cancellationTokenSource: vscode.CancellationTokenSource;
    public working_on_attach_filename: string = "";
    public working_on_attach_code: string = "";
    public working_on_snippet_code: string = "";
    public working_on_snippet_range: vscode.Range | undefined = undefined;
    public working_on_snippet_editor: vscode.TextEditor | undefined = undefined;
    public working_on_snippet_column: vscode.ViewColumn | undefined = undefined;
    public model_to_thirdparty: {[key: string]: boolean} = {};

    public get_messages(): [string, string][] {
        return this.messages;
    }

    public constructor(
        public web_panel: vscode.WebviewPanel | vscode.WebviewView,
        public chatHistoryProvider: ChatHistoryProvider,
        public chat_id = ""
    ) {
        this.cancellationTokenSource = new vscode.CancellationTokenSource();
    }

    focus() {
        this.web_panel.webview.postMessage({command: "focus"});
    }

    dispose() {
        const otherTabs = global.open_chat_tabs.filter(openTab => openTab.chat_id === this.chat_id);
        global.open_chat_tabs = otherTabs;
    }

    static async open_chat_in_new_tab(chatHistoryProvider: ChatHistoryProvider, chat_id: string, extensionUri: string) {

        const history = await chatHistoryProvider.lookup_chat(chat_id);
        if(history === undefined) { return; }

        const {
            chatModel,
            messages,
            chat_title
        } = history;
    

        // note: creating a new column helps the focus, but we can only have two columns open at a time, so tabs get put into the last one :/

        const panel = vscode.window.createWebviewPanel(
            "refact-chat-tab", 
            `Refact.ai ${chat_title}`, 
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        const tab = new ChatTab(panel, chatHistoryProvider, chat_id);
        
        if(global.open_chat_tabs === undefined) { // TODO: find out how this gets unset :/
            global.open_chat_tabs = [tab];
        } else {
            global.open_chat_tabs.push(tab);
        }

        panel.onDidDispose(tab.dispose);
        
        panel.webview.html = tab.get_html_for_chat(panel.webview, extensionUri, true);

        panel.webview.onDidReceiveMessage(async ({type, ...data}) => {
            switch(type) {
                case "chat-question-enter-hit": {
                    return await tab.post_question_and_communicate_answer(
                        data.chat_question,
                        data.chat_model,
                        "",
                        data.chat_attach_file,
                        data.chat_messages_backup,
                    );
                }
            }
        });

        await tab._clear_and_repopulate_chat("", undefined, false, chatModel, messages);
    }

    public static async clear_and_repopulate_chat(
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
        // Okay the ceck here is for a selected chat
        let free_floating_tab = global.side_panel?.chat;
        if (!free_floating_tab) {
            console.log("no chat found!");
            return;
        }
        await free_floating_tab._clear_and_repopulate_chat(question, editor, attach_default, use_model, messages);
    }
    
    async _clear_and_repopulate_chat(
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

        let code_snippet = "";
        this.working_on_snippet_range = undefined;
        this.working_on_snippet_editor = undefined;
        this.working_on_snippet_column = undefined;

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
                this.working_on_snippet_range = selection;
                this.working_on_snippet_editor = editor;
                this.working_on_snippet_column = editor.viewColumn;
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
            this.working_on_attach_code = attach;
            this.working_on_attach_filename = short_fn;
        }
        this.working_on_snippet_code = code_snippet;
        this.messages = messages;

        // This refills the chat
        this.web_panel.webview.postMessage({
            command: "chat-clear",
        });

        let messages_backup: [string, string][] = [];
        for (let i = 0; i < messages.length; i++) {
            let [role, content] = messages[i];
            let is_it_last_message = i === messages.length - 1;  // otherwise, put user message into the input box
            if (role === "user" && !is_it_last_message) {
                this._question_to_div(content, messages_backup);  // send message inside
            }
            messages_backup.push([role, content]); // answers should have itselves in the backup
            if (role === "context_file") {
                this._answer_to_div(role, content, messages_backup);  // send message inside
            }
            if (role === "assistant") {
                this._answer_to_div(role, content, messages_backup);  // send message inside
            }
        }

        if (messages.length > 0) {
            let last_message = messages[messages.length - 1];
            let [last_role, last_content] = last_message;
            if (last_role === "user") {
                let pass_dict = { command: "chat-set-question-text", value: {question: last_content} };
                this.web_panel.webview.postMessage(pass_dict);
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
            this.web_panel.webview.postMessage(pass_dict);
        }
        this.web_panel.webview.postMessage(fireup_message);

        if (!use_model) {
            [use_model, ] = await chat_model_get(); // model is infered from the history
        }
        let combo_populate_message = {
            command: "chat-models-populate",
            chat_models: [] as string[],
            chat_use_model: use_model,
        };
        await global.rust_binary_blob?.read_caps(); // can this throw ?
        for (let x of global.chat_models) {
            combo_populate_message["chat_models"].push(x);
        }
        this.web_panel.webview.postMessage(combo_populate_message);
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
        this.web_panel.webview.postMessage({
            command: "chat-post-question",
            question_html: html,
            question_raw: question,
            messages_backup: messages_backup,
        });
    }

    public _answer_to_div(role: string, content: string, messages_backup: [string, string][])
    {
        let command = "chat-post-answer";
        let valid_html = false;
        let html = "";
        let md = "";
        if (role === "assistant") {
            md = content;
        } else if (role === "context_file") {
            command = "chat-post-decoration";
            let files = JSON.parse(content);
            // let file_content = file_dict["file_content"];
            // file_content = escape(file_content);
            for (let file_dict of files) {
                md += `<span title="hren">📎 ${file_dict["file_name"]}</span><br/>\n`;
            }
        }

        try {
            let raw_md = md;
            let backtick_backtick_backtick_count = (content.match(/```/g) || []).length;
            if (backtick_backtick_backtick_count % 2 === 1) {
                raw_md = md + "\n```";
            }
            html = marked.parse(raw_md);
            valid_html = true;
        } catch (e) {
            valid_html = false;
        }
        if (valid_html) {
            this.web_panel.webview.postMessage({
                command: command,
                answer_html: html,
                answer_raw: content,
                have_editor: Boolean(this.working_on_snippet_editor),
                messages_backup: messages_backup,
            });
        }
    }

    async post_question_and_communicate_answer(   // User presses Enter
        question: string,
        model: string,
        model_function: string,
        attach_file: boolean,
        restore_messages_backup: [string, string][],
    ) {
        // TBD:  could "if (!this)" happen?
        // if (!global.side_panel?._view) {
        //     return;
        // }

        console.log(`post_question_and_communicate_answer saved messages backup: ${restore_messages_backup.length}`);
        this.messages = restore_messages_backup;

        await chat_model_set(model, model_function);  // successfully used model, save it

        this.cancellationTokenSource = new vscode.CancellationTokenSource();
        let cancelToken = this.cancellationTokenSource.token;

        if (this.messages.length === 0) {
            if (attach_file) {
                let single_file_json = JSON.stringify([{
                    "file_name": this.working_on_attach_filename,
                    "file_content": this.working_on_attach_code,
                }]);
                this.messages.push(["context_file", single_file_json]);
                // this.messages.push(["assistant", "Thanks for context, what's your question?"]);
            }
        }

        // global.side_panel._view.title = "Refact.ai Chat";

        if (this.messages.length > 0 && this.messages[this.messages.length - 1][0] === "user") {
            this.messages.length -= 1;
        }

        this.messages.push(["user", question]);
        let messages_backup = this.messages.slice();
        // TODO: save history, not add
        await this.chatHistoryProvider.save_messages_list(
            this.chat_id,
            this.messages,
            model,
        );
        if (this.messages.length > 10) {
            this.messages.shift();
            this.messages.shift(); // so it always starts with a user
        }
        this._question_to_div(question, messages_backup);
        this.web_panel.webview.postMessage({
            command: "chat-post-answer",
            answer_html: "⏳",
            answer_raw: "",
            have_editor: false,
            messages_backup: messages_backup,
        });
        await fetchAPI.wait_until_all_requests_finished();

        let answer = "";
        let answer_role = "";
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
                let role0, content0;
                if (json["choices"]) {
                    let choice0 = json["choices"][0];
                    if (choice0["delta"]) {
                        role0 = choice0["delta"]["role"];
                        content0 = choice0["delta"]["content"];
                    } else if (choice0["message"]) {
                        role0 = choice0["message"]["role"];
                        content0 = choice0["message"]["content"];
                    }
                    if (role0 === "context_file") {
                        let file_dict = JSON.parse(content0);
                        let file_content = file_dict["file_content"];
                        file_content = escape(file_content);
                        delta += `<span title="${file_content}">📎 ${file_dict["file_name"]}</span><br/>\n`;
                    } else {
                        delta = choice0["delta"]["content"];
                    }
                }
                if (delta) {
                    answer += delta;
                }
                if (role0) {
                    stack_this._answer_to_div(role0, answer, messages_backup);  // send message inside
                    answer_role = role0;
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
                stack_this.web_panel.webview.postMessage({
                    command: "chat-error-streaming",
                    backup_user_phrase: backup_user_phrase,
                    error_message: error_message,
                });
            } else {
                stack_this.messages.push([answer_role, answer]);
                await stack_this.chatHistoryProvider.save_messages_list(
                    stack_this.chat_id,
                    stack_this.messages,
                    model,
                );
                stack_this._answer_to_div(answer_role, answer, stack_this.messages);
                stack_this.web_panel.webview.postMessage({ command: "chat-end-streaming" });
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
        isTab = false,
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

                    ${isTab === false ? `<div class="chat-button-group">
                    <button class="back-button">← Back</button>
                    <button tabindex="-1" id="open_chat" class="open-tab-button">Open Chat</button>
                    </div>`: ""}

                    <div class="refactcss-chat__wrapper">
                        <div class="refactcss-chat__inner">
                            <div class="refactcss-chat__content">
                                <div class="refactcss-chat__welcome">
                                    Welcome to Refact chat! How can I assist you today? Please type question below.
                                </div>
                            </div>
                            <div class="refactcss-chat__panel">
                                <div class="refactcss-chat__commands">
                                    <div class="refactcss-chat__controls">
                                        <div><input type="checkbox" id="chat-attach" name="chat-attach"><label id="chat-attach-label" for="chat-attach">Attach file</label></div>
                                        <div class="refactcss-chat__model"><span>Use model:</span><select id="chat-model-combo"></select></div>
                                    </div>
                                    <button id="chat-stop" class="refactcss-chat__stop"><span></span>Stop&nbsp;generating</button>
                                    <button id="chat-regenerate" class="refactcss-chat__regenerate"><svg height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M6.19306266,7 L10,7 L10,9 L3,9 L3,2 L5,2 L5,5.27034886 C6.72510698,3.18251178 9.19576641,2 12,2 C17.5228475,2 22,6.4771525 22,12 C20,12 22,12 20,12 C20,7.581722 16.418278,4 12,4 C9.60637619,4 7.55353989,5.07869636 6.19306266,7 Z M17.8069373,17 L14,17 L14,15 L21,15 L21,22 L19,22 L19,18.7296511 C17.274893,20.8174882 14.8042336,22 12,22 C6.4771525,22 2,17.5228475 2,12 C2,12 4,12 4,12 C4,16.418278 7.581722,20 12,20 C14.3936238,20 16.4464601,18.9213036 17.8069373,17 Z" fill-rule="evenodd"/></svg>Regenerate</button>
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

export function backquote_backquote_backquote_remove_language_spec(code: string): string
{
    // this removes ```python or ```json or similar, assuming ``` itself is already not there
    while (1) {
        let first_char = code[0];
        if (first_char === "\n") {
            return code.substring(1);
        }
        if (first_char >= 'a' && first_char <= 'z' || first_char >= '0' && first_char <= '9') {
            code = code.substring(1);
            continue;
        } else {
            break;
        }
    }
    return code;
}

export function indent_so_diff_is_minimized(orig_code: string, code_block: string): string
{
    let least_bad = 1000000;
    let least_bad_block = "";
    let code_block_lines = code_block.split(/\r?\n/);
    for (const indent of ["", "    ", "        ", "            ", "                ", "                    ", "\t", "\t\t", "\t\t\t", "\t\t\t\t", "\t\t\t\t\t", "\t\t\t\t\t"]) {
        let code_block_indented = code_block_lines.map(line => indent + line).join('\n');
        const diff = Diff.diffWordsWithSpace(orig_code, code_block_indented);
        let how_bad = 0;
        for (const part of diff) {
            if (part.added) {
                how_bad += part.value.length;
            }
            if (part.removed) {
                how_bad += part.value.length;
            }
        }
        if (how_bad < least_bad) {
            least_bad = how_bad;
            least_bad_block = code_block_indented;
        }
    }
    return least_bad_block;
}

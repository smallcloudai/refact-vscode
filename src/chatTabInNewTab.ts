/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as fetchAPI from "./fetchAPI";
import ChatHistoryProvider from "./chatHistory";
// import * as userLogin from "./userLogin";
const Diff = require('diff');  // Documentation: https://github.com/kpdecker/jsdiff/
import { marked } from 'marked'; // Markdown parser documentation: https://marked.js.org/
import { ChatTab, chat_model_set } from "./chatTab";

// TODO: the name needs to be improved
// TDOD: remove duplicated code between this and chatTab.ts
// TODO: See if both chats can be kept in sync
// TODO: it could look better when resizing the window

export class ChatInWindowTab {
    public messages: [string, string][] = [];
    public cancellationTokenSource: vscode.CancellationTokenSource;
    public working_on_attach_filename: string = "";
    public working_on_attach_code: string = "";
    public working_on_snippet_code: string = "";
    public working_on_snippet_range: vscode.Range | undefined = undefined;
    public working_on_snippet_editor: vscode.TextEditor | undefined = undefined;
    public working_on_snippet_column: vscode.ViewColumn | undefined = undefined;
    public model_to_thirdparty: {[key: string]: boolean} = {};

    public constructor(
        public web_panel: vscode.WebviewPanel, // This may make this class reusable in chatTab.ts
        public chatHistoryProvider: ChatHistoryProvider,
        public chat_id: string
    ) {
        this.cancellationTokenSource = new vscode.CancellationTokenSource();
    }

    // public dispose() {
    //   // called by vscode inernally
    //   // not to be confused with this.web_panel.onDidDispose
    // }

    static async open_chat_in_new_tab(chatHistoryProvider: ChatHistoryProvider, chat_id: string, extensionUri: string) {

        const history = await chatHistoryProvider.lookup_chat(chat_id);
        if(history === undefined) { return; }

        const {
            chatModel,
            messages
        } = history;

        const panel = vscode.window.createWebviewPanel(
            "refact-chat-tab", 
            "Refact.ai Chat", // a better name would be good
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );
        
        // loads assets/chat.js in to the new tab
        panel.webview.html = ChatInWindowTab.get_html_for_chat(panel.webview, chatHistoryProvider, chat_id, extensionUri);

        const free_floating_tab = new ChatInWindowTab(panel, chatHistoryProvider, chat_id);

        panel.webview.onDidReceiveMessage(async ({type, ...data}) => {
            switch(type) {
                case "chat-question-enter-hit": {
                    return await free_floating_tab.post_question_and_communicate_answer(
                        data.chat_question,
                        data.chat_model,
                        "",
                        data.chat_attach_file,
                        data.chat_messages_backup,
                        );
                }
                default: return;
            }
        });

        // Populated the caht with data,
        await free_floating_tab.clear_and_repopulate_chat("", undefined, false, chatModel, messages);

    }

    async clear_and_repopulate_chat(
        question: string,
        editor: vscode.TextEditor | undefined, // What's this used for?
        attach_default: boolean,
        use_model: string, // could have more defined typing
        messages: [string, string][], // could have more defined typing, role = user | context_file | assistant 
    ) {
        let context: vscode.ExtensionContext | undefined = global.global_context;
        if (!context) {
            return;
        }

        const free_floating_tab = this; // TODO: just use "this"

        let code_snippet = "";
        free_floating_tab.working_on_snippet_range = undefined;
        free_floating_tab.working_on_snippet_editor = undefined;
        free_floating_tab.working_on_snippet_column = undefined;

        // sent to assets/chat.js
        let fireup_message = {
            command: "chat-set-fireup-options",
            chat_attach_file: "",
            chat_attach_default: false,
        };

        // by the looks of it, this could be removed?
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
            free_floating_tab.working_on_attach_filename = short_fn;
        }
        free_floating_tab.working_on_snippet_code = code_snippet;
        free_floating_tab.messages = messages; // bit odd 

        // This refills the chat
        this.web_panel.webview.postMessage({
            command: "chat-clear",
        });

        let messages_backup: [string, string][] = [];
        for (let i = 0; i < messages.length; i++) {
            let [role, content] = messages[i];
            let is_it_last_message = i === messages.length - 1;  // otherwise, put user message into the input box
            if (role === "user" && !is_it_last_message) {
                free_floating_tab._question_to_div(content, messages_backup);  // send message inside
            }
            messages_backup.push([role, content]); // answers should have itselves in the backup
            if (role === "context_file") {
                free_floating_tab._answer_to_div(role, content, messages_backup);  // send message inside
            }
            if (role === "assistant") {
                free_floating_tab._answer_to_div(role, content, messages_backup);  // send message inside
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

        // if (!use_model) {
        //     [use_model, ] = await chat_model_get(); // model is infered from the history
        // }
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


    // when in chatTab, this is called by sidebar, for this though it'll need to recive messages from the web_panel
    async post_question_and_communicate_answer(   // User presses Enter
        question: string,
        model: string,
        model_function: string,
        attach_file: boolean,
        restore_messages_backup: [string, string][],
    ) {
        // if (!global.side_panel?._view) {
        //     return;
        // }
        console.log(`post_question_and_communicate_answer saved messages backup: ${restore_messages_backup.length}`);
        this.messages = restore_messages_backup;

        await chat_model_set(model, model_function);  // successfully used model, save it

        this.cancellationTokenSource = new vscode.CancellationTokenSource();
        let cancelToken = this.cancellationTokenSource.token;

        // this shouldn't happen in the tab but can happen in th side bar
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
        let stack_this = this; // nice

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
                // global.side_panel?._view?.webview.postMessage({ command: "chat-end-streaming" });
                stack_this.web_panel.webview.postMessage({ command: "chat-end-streaming" })
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

    private _question_to_div(question: string, messages_backup: [string, string][]) {
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
        // this is handled in assets/chat.js
        this.web_panel.webview.postMessage({
            command: "chat-post-question",
            question_html: html,
            question_raw: question,
            messages_backup: messages_backup,
        });
    }

     // this is handled in assets/chat.js
    private _answer_to_div(
        role: string, 
        content: string, 
        messages_backup: [string, string][],
    )
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

    static get_html_for_chat(webView: vscode.Webview, chatHistoryProvider: ChatHistoryProvider, chat_id: string, extensionUri: any) {
            // TODO move this shared login somwhere else
            const chat = new ChatTab(chatHistoryProvider, chat_id);
            return chat.get_html_for_chat(webView, extensionUri, true);
    }

}

/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
// import * as fetchAPI from "./fetchAPI";
import ChatHistoryProvider from "./chatHistory";
// import * as userLogin from "./userLogin";
const Diff = require('diff');  // Documentation: https://github.com/kpdecker/jsdiff/
import { marked } from 'marked'; // Markdown parser documentation: https://marked.js.org/
import { ChatTab } from "./chatTab";

// TODO: the name needs to be improved
// TDOD: it'll need to be able to send a recive messages
// TDOD: remove duplicated code between this and chatTab.ts
// TODO: figure out how to get the iframe to send and recvive chat messages
// TODO: it could look better when resizing the window

export class ChatInWindowTab {
    public messages: [string, string][]; // is this needed ?
    public cancellationTokenSource: vscode.CancellationTokenSource;
    public working_on_attach_filename: string = "";
    public working_on_attach_code: string = "";
    public working_on_snippet_code: string = "";
    public working_on_snippet_range: vscode.Range | undefined = undefined;
    public working_on_snippet_editor: vscode.TextEditor | undefined = undefined;
    public working_on_snippet_column: vscode.ViewColumn | undefined = undefined;

    public constructor(
        public web_panel: vscode.WebviewPanel,
        public chatHistoryProvider: ChatHistoryProvider,
        public chat_id: string
    ) {
        this.messages = [];
        this.cancellationTokenSource = new vscode.CancellationTokenSource();
    }

    // public dispose() {
    //   // called by vscode inernally
    //   // not to be confused with this.web_panel.onDidDispose
    // }

    static async open_chat_in_new_tab(chatHistoryProvider: ChatHistoryProvider, chat_id: string, extensionUri: string) {
        const panel = vscode.window.createWebviewPanel(
            "refact-chat-tab", 
            "Refact.ai Chat", // a better name would be good
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        panel.webview.html = ChatInWindowTab.get_html_for_chat(panel.webview, chatHistoryProvider, chat_id, extensionUri);

        const free_floating_tab = new ChatInWindowTab(panel, chatHistoryProvider, chat_id);

        const history = await chatHistoryProvider.lookup_chat(chat_id);
        if(history === undefined) { return; }

        const {
            chatModel,
            messages
        } = history;

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

    private first_try_at_repoulating_data(messages:[string, string], free_floating_tab: ChatInWindowTab) {
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

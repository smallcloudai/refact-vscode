
/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as fetchAPI from "./fetchAPI";
import * as crlf from "./crlf";
import * as estate from "./estate";
import ChatHistoryProvider, { Chat } from "./chatHistory";
import {basename} from "path";
// import * as userLogin from "./userLogin";
const Diff = require("diff"); // Documentation: https://github.com/kpdecker/jsdiff/
import { marked } from "marked"; // Markdown parser documentation: https://marked.js.org/

// circular dependency
import { open_chat_tab } from "./sidebar";

// FIXME: vscode is importing the cjs chat script https://github.com/microsoft/vscode/issues/130367
import {
  EVENT_NAMES_FROM_CHAT,
  EVENT_NAMES_TO_CHAT,
} from "refact-chat-js/dist/events";



export function attach_code_from_editor(editor: vscode.TextEditor, insert_tag = false): [vscode.Range, vscode.Range, string, string, string]
{
    if (editor.document.uri.scheme !== "file") {
        return [new vscode.Range(0, 0, 0, 0), new vscode.Range(0, 0, 0, 0), "", "", ""];
    }
    let selection = editor.selection;
    let empty = selection.start.line === selection.end.line && selection.start.character === selection.end.character;
    let code_snippet = "";
    if (!empty) {
        let last_line_empty = selection.end.character === 0;
        let last_line_n = Math.max(selection.end.line - (last_line_empty ? 1 : 0), selection.start.line);
        let last_line_maxpos = editor.document.lineAt(last_line_n).range.end.character;
        selection = new vscode.Selection(selection.start.line, 0, last_line_n, last_line_maxpos);
        code_snippet = editor.document.getText(selection);
    }
    let fn = editor.document.fileName;
    let short_fn = fn.replace(/.*[\/\\]/, "");
    let pos0 = selection.start;
    let pos1 = selection.end;
    let attach = "";
    while (1) {
        let attach_before = editor.document.getText(new vscode.Range(pos0, selection.start));
        let attach_after = editor.document.getText(new vscode.Range(selection.start, pos1));
        let attach_test = attach_before + `${insert_tag ? "\n|INSERT-HERE|\n" : ""}` + attach_after;
        if (attach_test && attach_test.length > 2000) {
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
    let attach_range = new vscode.Range(pos0, pos1);
    [attach] = crlf.cleanup_cr_lf(attach, []);
    return [selection, attach_range, attach, short_fn, code_snippet];
}


export class ChatTab {
  // public static current_tab: ChatTab | undefined;
    private _disposables: vscode.Disposable[] = [];
    public messages: [string, string][] = [];
    public cancellationTokenSource: vscode.CancellationTokenSource;
    public working_on_attach_filename: string = "";
    public working_on_attach_code: string = "";
    public working_on_attach_range: vscode.Range | undefined = undefined;
    public working_on_snippet_code: string = "";
    public working_on_snippet_range: vscode.Range | undefined = undefined;
    public working_on_snippet_editor: vscode.TextEditor | undefined = undefined;
    public working_on_snippet_column: vscode.ViewColumn | undefined = undefined;
    public model_to_thirdparty: { [key: string]: boolean } = {};

    public get_messages(): [string, string][] {
        return this.messages;
    }

    public constructor(
        public web_panel: vscode.WebviewPanel | vscode.WebviewView,
        public chatHistoryProvider: ChatHistoryProvider,
        public chat_id = ""
    ) {
        this.cancellationTokenSource = new vscode.CancellationTokenSource();
        this.handleEvents = this.handleEvents.bind(this);

        this._disposables.push(vscode.window.onDidChangeActiveTextEditor(() => {
          this.postActiveFileInfo(this.chat_id);
        }));

        this._disposables.push(vscode.window.onDidChangeTextEditorSelection(() => {
          this.postActiveFileInfo(this.chat_id);
        }));

    }

    async focus() {
        if("reveal" in this.web_panel) {
            this.web_panel.reveal();
        }
    }

    dispose() {
        this._disposables.forEach(d => d.dispose());
        const otherTabs = global.open_chat_tabs.filter(
          (openTab) => openTab.chat_id !== this.chat_id
        );
        global.open_chat_tabs = otherTabs;
    }

    async getHistory(): Promise<Chat | undefined> {
        return this.chatHistoryProvider.lookup_chat(this.chat_id);
    }

    async saveToSideBar() {
        const history = await this.getHistory();
        this.chatHistoryProvider.save_messages_list(
            this.chat_id,
            this.messages,
            history?.chatModel || "",
            history?.chat_title
        );
        if (!global.side_panel?.chat) {
          global.side_panel?.goto_main();
        }
    }

    static async open_chat_in_new_tab(chatHistoryProvider: ChatHistoryProvider, chat_id: string, extensionUri: string) {

        const savedHistory = await chatHistoryProvider.lookup_chat(chat_id);

        const history = {
            chat_id: "",
            chatModel: "",
            messages: [],
            chat_title: "",
            ...(savedHistory || {})
        };

        const {
            chatModel,
            messages,
            chat_title
        } = history;


        const panel = vscode.window.createWebviewPanel(
            "refact-chat-tab",
            `Refact.ai ${chat_title}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        const tab = new ChatTab(panel, chatHistoryProvider, chat_id);

        if (global.open_chat_tabs === undefined) {
            // TODO: find out how this gets unset :/
            global.open_chat_tabs = [tab];
        } else {
            global.open_chat_tabs.push(tab);
        }

        panel.onDidDispose(async () => {
            await tab.saveToSideBar();
            tab.dispose();
        });

        panel.webview.html = tab.get_html_for_chat(panel.webview, extensionUri, true);

        panel.webview.onDidReceiveMessage(tab.handleEvents);

        await tab._clear_and_repopulate_chat(chat_title, undefined, false, chatModel, messages);
    }

    async restoreChat(chat: {
        id: string;
        messages: [string, string][];
        title?: string;
        model: string;
    }) {
        // this waits until the chat has been mounted
        return new Promise<void>((resolve) => {
            const disposables: vscode.Disposable[] = [];
            const restore = (event: { type: string }) => {
                if (event.type === EVENT_NAMES_FROM_CHAT.READY) {
                    this.web_panel.webview.postMessage({
                        type: EVENT_NAMES_TO_CHAT.RESTORE_CHAT,
                        payload: chat,
                    });
                    disposables.forEach((d) => d.dispose());
                    resolve();
                }
            };

            this.web_panel.webview.onDidReceiveMessage(
                restore,
                undefined,
                disposables
            );
        });

    }

    createNewChat() {
        this.web_panel.webview.postMessage({ type: EVENT_NAMES_TO_CHAT.NEW_CHAT });
    }

    postActiveFileInfo(id: string) {
        const file = this.getActiveFileInfo();
        const fileName = file.file_name;
        const lineInfo = file.line1 !== undefined && file.line2 !== undefined ? `:${file.line1}-${file.line2}` : "";

        const action = {
            type: EVENT_NAMES_TO_CHAT.ACTIVE_FILE_INFO,
            payload: {
                id: id,
                name: fileName + lineInfo,
                can_paste: vscode.window.activeTextEditor && vscode.window.activeTextEditor.selection.isEmpty === false ? true : false,
            },
        };

        this.web_panel.webview.postMessage(action);
    }

    sendFileToChat(id: string, file: {
        file_name: string,
        file_content: string,
        line1?: number;
        line2?: number
    }) {
        return this.web_panel.webview.postMessage({
            type: EVENT_NAMES_TO_CHAT.RECEIVE_FILES,
            payload: {
                id,
                files: [file]
            }
        });
    }

    getActiveFileInfo() {
        const file_name = basename(
        vscode.window.activeTextEditor?.document.fileName || ""
        );
        const file_content =
        vscode.window.activeTextEditor?.document.getText() || "";
        const start = vscode.window.activeTextEditor?.selection.start;
        const end = vscode.window.activeTextEditor?.selection.end;
        const maybeLineInfo = start !== undefined && end !== undefined && !start.isEqual(end)
            ? { line1: start.line + 1, line2: end.line + 1 }
            : {};
        const file = {
            file_name,
            file_content,
            ...maybeLineInfo,
        };

        return file;
    }

    async handleChatQuestion({
        id,
        model,
        title,
        messages,
        attach_file,
    }: {
        id: string;
        model: string;
        title: string;
        messages: [string, string][];
        // messages: ChatMessages;
        attach_file?: boolean;
    }): Promise<void> {
        console.log("HandleChatQuestion:", {
          id,
          model,
          title,
          messages,
          attach_file,
        });
        this.web_panel.webview.postMessage({type: EVENT_NAMES_TO_CHAT.SET_DISABLE_CHAT, payload: { id, disable: true }});

        if (attach_file) {
            const file = this.getActiveFileInfo();
            this.sendFileToChat(id, file);
            const message: [string, string] = ["context_file", JSON.stringify([file])];
            messages.unshift(message);
        }
        this.chat_id = id;
        this.messages = messages;
        this.cancellationTokenSource =
            new vscode.CancellationTokenSource();
        if (model) {
            await chat_model_set(model, ""); // successfully used model, save it
        }

        await this.chatHistoryProvider.save_messages_list(
            this.chat_id,
            this.messages,
            model,
            title
        );

        await fetchAPI.wait_until_all_requests_finished();
        const handle_response = (json: any) => {
            if (typeof json !== "object") {
            return;
            }
            const type = EVENT_NAMES_TO_CHAT.CHAT_RESPONSE;
            this.web_panel.webview.postMessage({
            type,
            payload: {
                id: this.chat_id,
                ...json,
            },
            });
        };

        const handle_stream_end = (
            maybe_error_message?: string
        ) => {
            if (maybe_error_message) {
            this.web_panel.webview.postMessage({
                type: EVENT_NAMES_TO_CHAT.ERROR_STREAMING,
                payload: {
                id: this.chat_id,
                message: maybe_error_message,
                },
            });
            } else {
            this.web_panel.webview.postMessage({
                type: EVENT_NAMES_TO_CHAT.DONE_STREAMING,
                payload: { id: this.chat_id },
            });
            }
        };

        const request = new fetchAPI.PendingRequest(
            undefined,
            this.cancellationTokenSource.token
        );
        request.set_streaming_callback(
            handle_response,
            handle_stream_end
        );
        // What's this for?
        const third_party = this.model_to_thirdparty[model];
        const chat_promise = fetchAPI.fetch_chat_promise(
            this.cancellationTokenSource.token,
            "chat-tab",
            this.messages,
            model,
            third_party
        );
        return request.supply_stream(...chat_promise);
      // wait for READY signal, send EVENT_NAMES_TO_CHAT.SET_DISABLE_CHAT and ask the question
    }

    async handleEvents({ type, ...data }: any) {
        // console.log({type, ...data})
        switch (type) {
            case "chat-question-enter-hit": {
            return this.handleEnterHit(data);
            }
            case "open-new-file": {
            return this.handleOpenNewFile(data);
            }
            case "stop-clicked": {
            return this.handleStopClicked();
            }
            case "diff-paste-back": {
            return this.handleDiffPasteBack(data);
            }
            case "send-chat-to-sidebar": {
            return this.handleSendToSideBar();
            }

            case EVENT_NAMES_FROM_CHAT.ASK_QUESTION: {
                // Note: context_file will be a different format
                const { id, messages, title, model, attach_file } = data.payload;
                this.handleChatQuestion({ id, model, title, messages, attach_file });
            }

            case EVENT_NAMES_FROM_CHAT.REQUEST_CAPS: {
                return fetchAPI
                    .get_caps()
                    .then((caps) => {
                        return this.web_panel.webview.postMessage({
                            type: EVENT_NAMES_TO_CHAT.RECEIVE_CAPS,
                            payload: {
                                id: data.payload.id,
                                caps,
                            },
                        });
                    })
                    .catch((err) => {
                        return this.web_panel.webview.postMessage({
                            type: EVENT_NAMES_TO_CHAT.RECEIVE_CAPS_ERROR,
                            payload: {
                                id: data.payload.id,
                                message: err.message,
                            },
                        });
                    });
            }

            case EVENT_NAMES_FROM_CHAT.SAVE_CHAT: {
                const { id, model, messages, title } = data.payload;
                return this.chatHistoryProvider.save_messages_list(
                    id,
                    messages,
                    model,
                    title
                );
            }
            case EVENT_NAMES_FROM_CHAT.STOP_STREAMING: {
                return this.cancellationTokenSource.cancel();
            }

            case EVENT_NAMES_FROM_CHAT.READY: {
                const { id } = data.payload;
                return this.postActiveFileInfo(id);
            }

            case EVENT_NAMES_FROM_CHAT.SEND_TO_SIDE_BAR: {
                return this.handleSendToSideBar();
            }

            case EVENT_NAMES_FROM_CHAT.NEW_FILE: {
                const value = data.payload.content;
                return this.handleOpenNewFile(value);
            }

            case EVENT_NAMES_FROM_CHAT.PASTE_DIFF: {
                const value = data.payload.content;
                return this.handleDiffPasteBack({ code_block: value });
            }

        // case EVENT_NAMES_FROM_CHAT.BACK_FROM_CHAT: {
        // // handled in sidebar.ts
        // }

        // case EVENT_NAMES_FROM_CHAT.OPEN_IN_CHAT_IN_TAB: {
        //  // handled in sidebar.ts
        // }

        }
    }

    async handleSendToSideBar() {
        await vscode.commands.executeCommand("refactai-toolbox.focus");

        let editor = vscode.window.activeTextEditor;
        const history = await this.getHistory();

        if(!history) {
            await this.chatHistoryProvider.save_messages_list(this.chat_id, this.messages, "");
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

        await open_chat_tab(
            history?.chat_title || "",
            editor,
            false,
            history?.chatModel || "",
            this.messages,
            this.chat_id,
        );
    }
    private async handleDiffPasteBack(data: {code_block: string}) {
        if (!this.working_on_snippet_editor) {
            return;
        }
        await vscode.window.showTextDocument(
            this.working_on_snippet_editor.document,
            this.working_on_snippet_column
        );
        let state = estate.state_of_document(
            this.working_on_snippet_editor.document
        );
        if (!state) {
            return;
        }
        if (!this.working_on_snippet_range) {
            return;
        }
        return diff_paste_back(
            state.editor,
            this.working_on_snippet_range,
            data.code_block,
        );
    }

    private handleStopClicked() {
        return this.cancellationTokenSource.cancel();
    }

    private async handleOpenNewFile(value: string) {
        vscode.workspace.openTextDocument().then((document) => {
            vscode.window.showTextDocument(document, vscode.ViewColumn.Active)
                .then((editor) => {
                    editor.edit((editBuilder) => {
                        editBuilder.insert(new vscode.Position(0, 0), value);
                    });
                });
        });
    }

    private async handleEnterHit({
        chat_question = "",
        chat_model = "",
        chat_attach_file = false,
        chat_messages_backup = []
    }) {
        if(chat_messages_backup.length < this.get_messages().length) {
            // handle retries
            console.log(`oops, we need ${chat_messages_backup.length} messages, in chat that already added ${this.get_messages().length}`);
            await this._clear_and_repopulate_chat(
                chat_question,
                undefined,
                chat_attach_file,
                chat_model,
                chat_messages_backup,
            );
        }
        return await this.post_question_and_communicate_answer(
            chat_question,
            chat_model,
            "",
            chat_attach_file,
            chat_messages_backup,
        );

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
        // Okay the check here is for a selected chat
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

        // let fireup_message = {
        //   command: "chat-set-fireup-options",
        //   chat_attach_file: "",
        //   chat_attach_default: false,
        // };

        if (editor) {
            let selection, attach_range: vscode.Range;
            [selection, attach_range, this.working_on_attach_code, this.working_on_attach_filename, code_snippet] = attach_code_from_editor(editor);
            this.working_on_attach_range = attach_range;
            if (!selection.isEmpty) {
                this.working_on_snippet_range = selection;
                this.working_on_snippet_editor = editor;
                this.working_on_snippet_column = editor.viewColumn;
            }
            // fireup_message["chat_attach_file"] = this.working_on_attach_filename;
            // fireup_message["chat_attach_default"] = attach_default;
        }
        this.working_on_snippet_code = code_snippet;
        this.messages = messages;


        return this.restoreChat({
            id: this.chat_id,
            model: use_model,
            messages,
            title: question,
        });



        // This refills the chat
        // this.web_panel.webview.postMessage({
        //     command: "chat-clear",
        // });

        // let messages_backup: [string, string][] = [];
        // for (let i = 0; i < messages.length; i++) {
        //     let [role, content] = messages[i];
        //     let is_it_last_message = i === messages.length - 1;  // otherwise, put user message into the input box
        //     if (role === "user" && !is_it_last_message) {
        //         this._question_to_div(content, messages_backup);  // send message inside
        //     }
        //     messages_backup.push([role, content]); // answers should have itselves in the backup
        //     if (role === "context_file") {
        //         this._answer_to_div(role, content, messages_backup);  // send message inside
        //     }
        //     if (role === "assistant") {
        //         this._answer_to_div(role, content, messages_backup);  // send message inside
        //     }
        // }

        // if (messages.length > 0) {
        //     let last_message = messages[messages.length - 1];
        //     let [last_role, last_content] = last_message;
        //     if (last_role === "user") {
        //         let pass_dict = { command: "chat-set-question-text", value: {question: last_content} };
        //         this.web_panel.webview.postMessage(pass_dict);
        //     }
        // } else {
        //     // fresh new chat, post code snippet if any
        //     let pass_dict = { command: "chat-set-question-text", value: {question: ""} };
        //     if (code_snippet) {
        //         pass_dict["value"]["question"] += "```\n" + code_snippet + "\n```\n";
        //     }
        //     if (question) {
        //         pass_dict["value"]["question"] += question;
        //     }
        //     this.web_panel.webview.postMessage(pass_dict);
        // }
        // this.web_panel.webview.postMessage(fireup_message);

        // if (!use_model) {
        //     [use_model, ] = await chat_model_get(); // model is infered from the history
        // }
        // let combo_populate_message = {
        //     command: "chat-models-populate",
        //     chat_models: [] as string[],
        //     chat_use_model: use_model,
        // };
        // await global.rust_binary_blob?.read_caps(); // can this throw ?
        // for (let x of global.chat_models) {
        //     combo_populate_message["chat_models"].push(x);
        // }
        // this.web_panel.webview.postMessage(combo_populate_message);
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
            for (let file_dict of files) {
                let file_content = file_dict["file_content"];
                let line1 = file_dict["line1"] || 0;
                let line2 = file_dict["line2"] || 0;
                let lines_range = `:${line1 + 1}-${line2 + 1}`;
                file_content = file_content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
                md += `<pre><span title="${file_content}">📎 ${file_dict["file_name"]}${lines_range}</span></pre><br/>\n`;
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
        console.log(`post_question_and_communicate_answer saved messages backup: ${restore_messages_backup.length}`);
        this.messages = restore_messages_backup;

        if (model) {
            await chat_model_set(model, model_function);  // successfully used model, save it
        }

        this.cancellationTokenSource = new vscode.CancellationTokenSource();
        let cancelToken = this.cancellationTokenSource.token;

        if (this.messages.length === 0) {
            if (attach_file && this.working_on_attach_filename) {
                let single_file_json = JSON.stringify([{
                    "file_name": this.working_on_attach_filename,
                    "file_content": this.working_on_attach_code,
                    "line1": this.working_on_attach_range?.start.line,
                    "line2": this.working_on_attach_range?.end.line,
                }]);
                this.messages.push(["context_file", single_file_json]);
                // this.messages.push(["assistant", "Thanks for context, what's your question?"]); -- not nessessary
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

        // update side panel if this is a new question and no other chat is active
        if("reveal" in this.web_panel && this.messages.length === 1 && global.side_panel && global.side_panel.chat === null) {
            global.side_panel.goto_main();
        }

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
                        delta = content0;
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
        isTab = false
    ): string {

        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "node_modules", "refact-chat-js", "dist", "refact-chat.umd.cjs")
        );
        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "node_modules", "refact-chat-js", "dist", "style.css")
        );

        const styleOverride = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "assets", "custom-theme.css")
        );

        const nonce = ChatTab.getNonce();
        return `<!DOCTYPE html>
            <html lang="en" class="light">
            <head>
                <meta charset="UTF-8">
                <!--
                    Use a content security policy to only allow loading images from https or from our extension directory,
                    and only allow scripts that have a specific nonce.
                    TODO: remove  unsafe-inline if posable
                -->
                <meta http-equiv="Content-Security-Policy" content="style-src ${webview.cspSource} 'unsafe-inline'; img-src 'self' data: https:; script-src 'nonce-${nonce}'; style-src-attr 'sha256-tQhKwS01F0Bsw/EwspVgMAqfidY8gpn/+DKLIxQ65hg=' 'unsafe-hashes';">
                <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1">

                <title>Refact.ai Chat</title>
                <link href="${styleMainUri}" rel="stylesheet">
                <link href="${styleOverride}" rel="stylesheet">
            </head>
            <body>
                <div id="refact-chat"></div>

                <script nonce="${nonce}" src="${scriptUri}"></script>

                <script nonce="${nonce}">
                window.onload = function() {
                    const root = document.getElementById("refact-chat")
                    RefactChat.render(root, {host: "vscode", tabbed: ${isTab}})
                }
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
    if (chat_model === "" || !global.chat_models.includes(chat_model)) {
        chat_model = global.chat_default_model;
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
        let code_block_indented = code_block_lines.map(line => (line !== "" ? (indent + line) : "")).join('\n');
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

export function diff_paste_back(
    editor: vscode.TextEditor,
    dest_range: vscode.Range,
    new_code_block: string,
): number {
    let state = estate.state_of_document(editor.document);
    if (!state) {
        console.log("diff_paste_back: no state");
        return -1;
    }
    if (state.get_mode() !== estate.Mode.Normal && state.get_mode() !== estate.Mode.DiffWait) {
        console.log("diff_paste_back: not in normal mode");
        return -1;
    }
    if (dest_range.isEmpty) {
        console.log("diff_paste_back: dest_range is empty");
        return -1;
    }
    let snippet_ofs0 = editor.document.offsetAt(dest_range.start);
    let snippet_ofs1 = editor.document.offsetAt(dest_range.end);
    let code_block_clean = backquote_backquote_backquote_remove_language_spec(new_code_block);
    let text = editor.document.getText();
    let orig_text0 = text.substring(0, snippet_ofs0);
    let orig_text1 = text.substring(snippet_ofs1);
    let orig_code = text.substring(snippet_ofs0, snippet_ofs1);
    if (orig_text1.startsWith("\n")) {
        orig_text1 = orig_text1.substring(1);
    } else if (orig_text1.startsWith("\r\n")) {
        orig_text1 = orig_text1.substring(2);
    }
    [orig_code] = crlf.cleanup_cr_lf(orig_code, []);
    [code_block_clean] = crlf.cleanup_cr_lf(code_block_clean, []);
    code_block_clean = indent_so_diff_is_minimized(orig_code, code_block_clean);
    let modif_doc: string = orig_text0 + code_block_clean + orig_text1;
    [modif_doc] = crlf.cleanup_cr_lf(modif_doc, []);
    state.showing_diff_modif_doc = modif_doc;
    state.showing_diff_move_cursor = true;
    estate.switch_mode(state, estate.Mode.Diff);
    let last_affected_line = -1;
    if (state.diffAddedLines.length > 0) {
        last_affected_line = Math.max(...state.diffAddedLines);
    }
    if (state.diffDeletedLines.length > 0) {
        last_affected_line = Math.max(...state.diffDeletedLines);
    }
    return last_affected_line;
}

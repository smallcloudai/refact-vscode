/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as rconsoleCommands from "./rconsoleCommands";
import * as sidebar from "./sidebar";
import * as chatTab from "./chatTab";
import { v4 as uuidv4 } from 'uuid';
import { ChatMessages } from 'refact-chat-js/dist/events';

export class MyCommentAuthorInformation implements vscode.CommentAuthorInformation {
    name: string;
    iconPath?: vscode.Uri;
    constructor(name: string, iconPath?: vscode.Uri) {
        this.name = name;
        this.iconPath = iconPath;
    }
}
export class MyComment implements vscode.Comment {
    body: vscode.MarkdownString;
    mode: vscode.CommentMode;
    author: vscode.CommentAuthorInformation;
    reactions?: vscode.CommentReaction[];

    constructor(body: string, mode: vscode.CommentMode, author: vscode.CommentAuthorInformation) {
        this.body = new vscode.MarkdownString();

        this.body.appendMarkdown(body);

        this.body.isTrusted = true;

        this.body.supportHtml = true;
        this.mode = mode;
        this.author = author;
        this.reactions = undefined;
        // this.reactions = [
        //     new MyCommentReaction("Like", vscode.Uri.parse("https://github.githubassets.com/images/icons/emoji/unicode/1f44d.png"), 15, false),
        //     // new vscode.CommentReaction('👎', 'Dislike'),
        // ];
    }
}

export class RefactConsoleProvider {
    comment_controller: vscode.CommentController;
    official_selection: vscode.Range;
    attach_range: vscode.Range;
    working_on_attach_code: string;
    working_on_attach_filename: string;
    code_snippet: string = "";
    editor: vscode.TextEditor;
    model_name: string;
    thread: vscode.CommentThread;
    messages: rconsoleCommands.Messages;

    hint_debounce?: NodeJS.Timeout;
    input_text = "";
    hint_mode = true;
    disposable_commands: vscode.Disposable[] = [];


    static close_all_consoles(): vscode.Uri | undefined {
        if (global.comment_disposables) {
            for (let d of global.comment_disposables) {
                d.dispose();
            }
        }
        global.comment_disposables = [];
        let ret = global.comment_file_uri;
        global.comment_file_uri = undefined;
        return ret;
    }

    static async open_between_lines(editor: vscode.TextEditor) {
        let [model_name, _] = await chatTab.chat_model_get();
        return new RefactConsoleProvider(editor, model_name);
    }

    constructor(
        editor: vscode.TextEditor,
        model_name: string,
    ) {
        RefactConsoleProvider.close_all_consoles();

        this.editor = editor;
        this.model_name = model_name;
        this.comment_controller =  vscode.comments.createCommentController("refactai-test", "RefactAI Test Comments");
        global.comment_file_uri = editor.document.uri;

        [
            this.official_selection,
            this.attach_range,
            this.working_on_attach_code,
            this.working_on_attach_filename,
            this.code_snippet
        ] = chatTab.attach_code_from_editor(editor, false);

        this.dispose = this.dispose.bind(this);
        this.handle_message_stream = this.handle_message_stream.bind(this);
        this.handle_message_stream_end = this.handle_message_stream_end.bind(this);
        this.handle_text_document_change = this.handle_text_document_change.bind(this);
        this.handle_close_inline_chat = this.handle_close_inline_chat.bind(this);
        this.handle_move_chat_to_sidebar = this.handle_move_chat_to_sidebar.bind(this);

        this.thread = this.initialize_thread();
        this.messages = this.initial_messages();

        global.comment_disposables.push(this);
        global.comment_disposables.push(
            vscode.workspace.onDidChangeTextDocument(this.handle_text_document_change)
        );
        global.comment_disposables.push(
            vscode.workspace.onDidCloseTextDocument(this.handle_text_document_close)
        );

        global.comment_disposables.push(
            vscode.commands.registerCommand("refactaicmd.sendChatToSidebar", this.handle_move_chat_to_sidebar)
        );

        global.comment_disposables.push(
            vscode.commands.registerCommand("refactaicmd.closeInlineChat", this.handle_close_inline_chat)
        );

        this.scroll_to_thread();

        this.initial_message();

    }

    async initial_message() {
        await vscode.commands.executeCommand('setContext', 'refactcx.runEsc', true);
        // This trick puts cursor into the input box, possibly VS thinks the only use for
        // the thread is to ask user if there are no messages. But then we add a message.
        await new Promise(resolve => setTimeout(resolve, 100));
        let [hint, author, _top1] = await rconsoleCommands.get_hints(this.messages, "", this.official_selection, this.model_name);
        const hint_comment = this.format_message(author, hint);
        this.thread.comments = [hint_comment];
    }

    async handle_move_chat_to_sidebar() {
        let question = "```\n" + this.code_snippet + "\n```\n\n" + this.input_text;
        this.activate_chat(this.messages, question);
    }

    handle_close_inline_chat() {
        global.comment_disposables.forEach(disposable => {
            disposable.dispose();
        });
        global.comment_disposables = [];
    }

    remove_click_handlers_for_commands() {
        this.disposable_commands.forEach(command => command.dispose());
    }

    async add_click_handlers_for_commands() {
        this.remove_click_handlers_for_commands();
        const toolbox_config = await rconsoleCommands.ensure_toolbox_config();
        if(!toolbox_config) {
            console.log(["RefactConsoleCommands: No toolbox config found"]);
            return;
        }
        Object.keys(toolbox_config.toolbox_commands).forEach(cmd => {
            if (cmd !== "help") {
                const commandName = rconsoleCommands.createCommandName(cmd);
                this.disposable_commands.push(
                    vscode.commands.registerCommand(commandName, () =>  {
                        this.activate_cmd(cmd, "");
                    })
                );
            }
        });
    };

    reset_thread() {
        this.thread.comments = [
            this.format_message("assistant", "Thinking...")
        ];
    }

    send_messages_to_thread() {
        const assistant_messages = this.messages.filter(message => message[0] !== "context_file" && message[0] !== "user");
        const last_message = assistant_messages.slice(-1);
        let new_comments = last_message.map(([author, message]) => this.format_message(author, message));

        if (new_comments.length === 0) {
            this.reset_thread();
        } else {
            this.thread.comments = new_comments;
        }
    }

    format_message(author: string, text: string) {
        let embellished_author = author;
        if (author === "user") {
            embellished_author = "You";
        }
        if (author === "assistant") {
            embellished_author = "🤖 Refact";
        }
        if (author === "error") {
            embellished_author = "🤖 Snap!";
        }
        const comment_author_info = new MyCommentAuthorInformation(embellished_author);
        return new MyComment(text, vscode.CommentMode.Preview, comment_author_info);
    }

    initial_messages(): rconsoleCommands.Messages {
        return rconsoleCommands.initial_messages(this.working_on_attach_filename, this.editor.selection);
    }

    dispose() {
        console.log("console dispose");
        this.remove_click_handlers_for_commands();
        // this.thread.dispose();
        this.comment_controller.dispose();
    }

    initialize_thread(): vscode.CommentThread {
        const next_line = this.official_selection.isEmpty ? (
            this.official_selection.end.line
        ) : Math.min(
            this.official_selection.end.line + 1,
            this.editor.document.lineCount - 1
        );

        const comment_thread_range = new vscode.Range(next_line, 0, next_line, 0);
        this.comment_controller.commentingRangeProvider = {
            provideCommentingRanges: (document: vscode.TextDocument) => {
                return [comment_thread_range];
            },
        };
        this.comment_controller.reactionHandler = (comment: vscode.Comment, reaction: vscode.CommentReaction): Thenable<void> => {
            console.log("reactionHandler", comment, reaction);
            return Promise.resolve();
        };

        const thread = this.comment_controller.createCommentThread(
            this.editor.document.uri,
            comment_thread_range,
            [],
        );

        thread.canReply = true;
        thread.label = "Refact Console (F1)";
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;

        return thread;
    }

    handle_message_stream(author_role: string, answer: string) {
        const last = this.thread.comments.length > 0 ? this.thread.comments[this.thread.comments.length - 1] : null;
        const comment = this.format_message(author_role, answer);

        if(last instanceof MyComment && last.author.name === comment.author.name) {
            const previousComments = this.thread.comments.slice(0, -1);
            this.thread.comments = [
                ...previousComments,
                comment
            ];
        } else {
            this.thread.comments = [
                ...this.thread.comments,
                comment,
            ];
        }
    };

    scroll_to_thread() {
        return;
        const thread = this.thread.range.end.line;
        const range = new vscode.Range(thread, 0, thread + 10, 0);
        this.editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
    }

    send_thread_to_line(line: number) {
        const thread_range = new vscode.Range(line, 0, line, 0);
        this.thread.range = thread_range;
        this.scroll_to_thread();
    }

    handle_message_stream_end(response_messages: rconsoleCommands.Messages, maybe_last_affected_line? : number) {
        this.messages = response_messages;
        if(
            maybe_last_affected_line !== undefined
            && maybe_last_affected_line >= 0
            && this.thread.range.start.line !== maybe_last_affected_line
        ) {
            this.send_thread_to_line(maybe_last_affected_line);
        }

        this.send_messages_to_thread();
        vscode.commands.executeCommand("setContext", "refactaicmd.openSidebarButtonEnabled", true);
        // "comments/commentThread/additionalActions": [
        // 	{
        // 		"command": "refactaicmd.sendChatToSidebar",
        // 		"group": "inline@1"
        // 	},
        // 	{
        // 		"command": "refactaicmd.closeInlineChat",
        // 		"group": "inline@2"
        // 	}
        // ]
    }

    handle_text_document_close(e: vscode.TextDocument) {
        if (e.uri.scheme !== "comment") {
            return;
        }
        RefactConsoleProvider.close_all_consoles();
    }


    async handle_user_pressed_enter(event: vscode.TextDocumentChangeEvent) {
        // handle pressed enter
        // active  chat also close the console
        const toolbox_config = await rconsoleCommands.ensure_toolbox_config();

        let comment_editor = vscode.window.visibleTextEditors.find((e1) => {
            return e1.document.uri === event.document.uri;
        });

        let first_line = this.input_text.split("\n")[0];

        if (first_line.startsWith("/") && toolbox_config) {
            for (let cmd in toolbox_config.toolbox_commands) {
                if (cmd === "help") {
                    continue;
                }
                if (first_line.startsWith("/" + cmd)) { // maybe first_line.trim() === `/${cmd}`
                    this.hint_mode = false;
                    vscode.commands.executeCommand("setContext", "refactaicmd.openSidebarButtonEnabled", false);
                    if (comment_editor) {
                        await comment_editor.edit(edit => {
                            edit.delete(new vscode.Range(0, 0, 1000, 0));
                        });
                    }
                    this.reset_thread();
                    let args = first_line.substring(cmd.length + 1);
                    this.activate_cmd(cmd, args.trim());
                    return;
                }
            }
        } else if (this.input_text.trim() === "") {
            // do nothing
        } else {
            this.hint_mode = false;
            if (this.code_snippet !== "") {
                const question = "```\n" + this.code_snippet + "\n```\n\n" + this.input_text;
                this.activate_chat(this.messages, question);
            } else {  // if(this.messages.length > 1)
                this.activate_chat(this.messages, this.input_text);
            }
        }
    }

    async hints_and_magic_tabs(event: vscode.TextDocumentChangeEvent) {
        const [hint, author, top1] = await rconsoleCommands.get_hints(this.messages, this.input_text, this.official_selection, this.model_name);

        if (this.hint_mode) {
            if (this.hint_debounce) {
                clearTimeout(this.hint_debounce);
            }
            this.hint_debounce = setTimeout(async () => {
                // this is a heavy operation, changes the layout and lags the UI
                this.thread.comments = [
                    this.format_message(author, hint)
                ];
            }, 200);
        }

        await vscode.commands.executeCommand('setContext', 'refactcx.runEsc', true);

        if (top1 && this.input_text.match(/\/[a-zA-Z0-9_]+[\t ]+$/)) {
            let comment_editor = vscode.window.visibleTextEditors.find((e1) => {
                return e1.document.uri === event.document.uri;
            });
            let ideal = "/" + top1 + " ";
            if (comment_editor) {
                if (this.input_text.trim() !== ideal.trim()) {
                    await comment_editor.edit(edit => {
                        edit.delete(new vscode.Range(0, 0, 1000, 0));
                        edit.insert(new vscode.Position(0, 0), ideal);
                    });
                }
            }
            return;
        }
    }

    async handle_text_document_change(e: vscode.TextDocumentChangeEvent) {
        // console.log("onDidChangeTextDocument", e.document.uri, this.messages.length);

        if (e.document.uri.scheme !== "comment") {
            return;
        }

        this.input_text = e.document.getText();
        // this.hint_mode = this.input_text.startsWith("/");

        // if(this.hint_mode) {
        //     this.add_click_handlers_for_commands();
        // } else {
        //     this.remove_click_handlers_for_commands();
        // }


        if (this.input_text.includes("\n")) {
            return await this.handle_user_pressed_enter(e);
        }

        await this.hints_and_magic_tabs(e);
    }

    activate_cmd(
        cmd: string,
        args: string
    ) {
        console.log(`activate_cmd refactaicmd.cmd_${cmd} args="${args}"`);
        vscode.commands.executeCommand("setContext", "refactaicmd.runningChat", true);
        vscode.commands.executeCommand(
            "refactaicmd.cmd_" + cmd,
            args,
            this.editor.document.uri.toString(),
            this.model_name,
            this.handle_message_stream, // bind this
            this.handle_message_stream_end // bind this
        );
    }

    async activate_chat(
        messages: rconsoleCommands.Messages,
        question: string,
    ) {
        console.log(`activate_chat question.length=${question.length}`);
        RefactConsoleProvider.close_all_consoles();
        await vscode.commands.executeCommand("refactai-toolbox.focus");
        for (let i = 0; i < 10; i++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            if (global.side_panel && global.side_panel._view) {
                break;
            }
        }

        const id = uuidv4();

        // const messagesWithQuestion: ChatMessages = appendQuestion(question, messages) as ChatMessages;

        // this really opens chat somehow
        let chat: chatTab.ChatTab | undefined = await sidebar.open_chat_tab(
            question,
            this.editor,
            false,
            this.model_name,
            [],
            // messagesWithQuestion,
            id,
        );
        if (!chat) {
            return;
        }

        // TODO: This looks weird with all the changes from the call to restore
        // const disposables: vscode.Disposable[] = [];
        // disposables.push(chat.web_panel.webview.onDidReceiveMessage(e => {
        //     if(chat && e.type === EVENT_NAMES_FROM_CHAT.READY && e.payload.id === chat.chat_id) {
        //         chat.handleChatQuestion({
        //             id: chat.chat_id,
        //             model: this.model_name,
        //             title: question,
        //             messages: messagesWithQuestion,
        //             attach_file: false,
        //         });
        //         disposables.forEach(d => d.dispose());
        //     }
        // }));

        await new Promise(r => setTimeout(r, 200));
    }
}

function appendQuestion(question: string, messages: rconsoleCommands.Messages): rconsoleCommands.Messages {
    if(messages.length === 0) {
        return [["user", question]];
    }
    const lastMessage = messages[messages.length - 1];

    // for some reason this is circular?
    if(lastMessage[0] === "user") {
        const message: [string, string][] = [["user", lastMessage[1] + '\n' + question]];
        return messages.slice(0, -1).concat(message);
    }

    return messages.concat([["user", question]]);
}
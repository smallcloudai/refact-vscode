/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as rconsoleCommands from "./rconsoleCommands";
import * as sidebar from "./sidebar";
import * as chatTab from "./chatTab";


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
        this.body.isTrusted = {
            enabledCommands: Object.keys(rconsoleCommands.commands_available).map(cmd => rconsoleCommands.createCommandName(cmd))
        };
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

function embelish_author(author: string) {
    let embelished_author = author;
    if (author === "user") {
        embelished_author = "You";
    }
    if (author === "assistant") {
        embelished_author = "🤖 Refact";
    }
    return embelished_author;
}

function message_to_comment(author: string, text: string) {
    return new MyComment(text, vscode.CommentMode.Preview, new MyCommentAuthorInformation(embelish_author(author)));
}

// function format_messages(messages: rconsoleCommands.Messages) {
//     return messages.filter(([role, _]) => {
//         return role !== "context_file";
//     }).map(([author, text]) => {
//         return message_to_comment(author, text);
//     });
// }

export function refact_console_close(): vscode.Uri|undefined
{
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

function update_context_file_with_insert_tag(messages: rconsoleCommands.Messages, editor: vscode.TextEditor): rconsoleCommands.Messages {
    return messages.map(([type, text]) => {
        if(type === "context_file") {
            const [_official_selection, working_on_attach_code, working_on_attach_filename, _code_snippet] = chatTab.attach_code_from_editor(editor, true);
            return rconsoleCommands.initial_messages(working_on_attach_filename, working_on_attach_code)[0];
        }
        return [type, text];
    });
}

export async function open_refact_console_between_lines(editor: vscode.TextEditor)
{
    refact_console_close();
    global.comment_file_uri = editor.document.uri;
    let [official_selection, working_on_attach_code, working_on_attach_filename, code_snippet] = chatTab.attach_code_from_editor(editor);
    let cc = vscode.comments.createCommentController("refactai-test", "RefactAI Test Comments");
    cc.commentingRangeProvider = {
        provideCommentingRanges: (document: vscode.TextDocument) => {
            return [official_selection];
        },
    };
    cc.reactionHandler = (comment: vscode.Comment, reaction: vscode.CommentReaction): Thenable<void> => {
        console.log("reactionHandler", comment, reaction);
        return Promise.resolve();
    };

    let thread: vscode.CommentThread = cc.createCommentThread(
        editor.document.uri,
        new vscode.Range(official_selection.start.line, 0, official_selection.end.line, 0),
        [],
    );
    let hint_mode = true;
    thread.canReply = true;
    thread.label = "Refact Console (F1)";
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;

    global.comment_disposables.push(thread);
    global.comment_disposables.push(cc);

    let messages: [string, string][] = rconsoleCommands.initial_messages(working_on_attach_filename, working_on_attach_code);

    function messages_to_comments(clear = false) {
        const assistant_messages = messages.filter(message => message[0] !== "context_file" && message[0] !== "user");
        const last_message = assistant_messages.slice(-1);
        let new_comments = last_message.map(([author, message]) => message_to_comment(author, message));

        if (new_comments.length === 0 || clear) {
            new_comments = [
                message_to_comment(embelish_author("assistant"), "Thinking...")
            ];
        }
        thread.comments = new_comments;
    }

    const update_thread_callback: rconsoleCommands.ThreadCallback = (author_role, answer) => {
        const last = thread.comments.length > 0 ? thread.comments[thread.comments.length - 1] : null;
        const comment = message_to_comment(embelish_author(author_role), answer);
        if(last instanceof MyComment && last.author.name === comment.author.name) {
            const previouseComments = thread.comments.slice(0, -1);
            thread.comments = [
                ...previouseComments,
                comment
            ];
        } else {
            thread.comments = [
                ...thread.comments,
                comment,
            ];
        }
    };

    const end_thread_callback = (response_messages: [string, string][]) => {
        messages = response_messages;
        messages_to_comments();
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
    };
    let text = "";
    let hint_debounce: NodeJS.Timeout|undefined;
    const disposable_commands: vscode.Disposable[] = [];
    const disposeCommands = () => {
        disposable_commands.forEach(command => command.dispose());
    };

    const addCommand = (cmd: string) => {
        const commandName = rconsoleCommands.createCommandName(cmd);
        disposable_commands.push(
            vscode.commands.registerCommand(commandName, () =>  {
                activate_cmd(cmd, editor, messages, update_thread_callback, end_thread_callback);
            })
        );
    };

    const registerCommands = () => {
        disposeCommands();
        Object.keys(rconsoleCommands.commands_available).forEach(cmd => {
            addCommand(cmd);
        });
    };

    let did1 = vscode.workspace.onDidChangeTextDocument(async e => {
        console.log("onDidChangeTextDocument", e.document.uri, messages.length);
        if (e.document.uri.scheme !== "comment") {
            return;
        }
        if (messages.length === 0) {
            return;
        }
        text = e.document.getText();
        if(text.startsWith("/")) {
            registerCommands();
        } else {
            disposeCommands();
        }

        if (text.includes("\n")) {
            let comment_editor = vscode.window.visibleTextEditors.find((e1) => {
                return e1.document.uri === e.document.uri;
            });
            let first_line = text.split("\n")[0];
            if (first_line.startsWith("/")) {
                for (let cmd in rconsoleCommands.commands_available) {
                    if (first_line.startsWith("/" + cmd)) {
                        hint_mode = false;
                        vscode.commands.executeCommand("setContext", "refactaicmd.openSidebarButtonEnabled", false);
                        if (comment_editor) {
                            await comment_editor.edit(edit => {
                                edit.delete(new vscode.Range(0, 0, 1000, 0));
                            });
                        }
                        // messages = [["Command", cmd]];
                        // messages = [];
                        messages_to_comments(true); // use this to remove chat
                        activate_cmd(cmd, editor, messages, update_thread_callback, end_thread_callback);
                        return;
                    }
                }
            } else {
                hint_mode = false;
                let question;
                const messages_with_insert_tag = update_context_file_with_insert_tag(messages, editor);
                if (code_snippet === "") {
                    question = "Replace |INSERT-HERE| with the following:\n\n" + text;
                } else {
                    question = "```\n" + code_snippet + "\n```\n\n" + text;
                }
                activate_chat(messages_with_insert_tag, question, editor);
            }
        }

        let top1 = "";
        if (hint_mode) {
            let hint, author;
            [hint, author, top1] = rconsoleCommands.get_hints(messages, text, official_selection);
            let single_hint_comment = [message_to_comment(author, hint)];
            if (hint_debounce) {
                clearTimeout(hint_debounce);
            }
            hint_debounce = setTimeout(async () => {
                // this is a heavy operation, changes the layout and lags the UI
                thread.comments = single_hint_comment;
            }, 200);
        }
        await vscode.commands.executeCommand('setContext', 'refactcx.runEsc', true);
        if (top1 && text.match(/\/[a-zA-Z0-9_]+[\t ]+$/)) {
            let comment_editor = vscode.window.visibleTextEditors.find((e1) => {
                return e1.document.uri === e.document.uri;
            });
            if (comment_editor) {
                await comment_editor.edit(edit => {
                    edit.delete(new vscode.Range(0, 0, 1000, 0));
                    edit.insert(new vscode.Position(0, 0), "/" + top1);
                });
            }
            return;
        }
    });
    let did2 = vscode.workspace.onDidCloseTextDocument(e => {
        if (e.uri.scheme !== "comment") {
            return;
        }
        disposeCommands();
        refact_console_close();
    });
    global.comment_disposables.push(did1);
    global.comment_disposables.push(did2);
    await vscode.commands.executeCommand('setContext', 'refactcx.runEsc', true);
    function initial_message()
    {
        let [hint, author, _top1] = rconsoleCommands.get_hints(messages, "", official_selection);
        const hint_comment = message_to_comment(author, hint);
        thread.comments = [hint_comment];
    }
    // This trick puts cursor into the input box, possibly VS thinks the only use for
    // the thread is to ask user if there are no messages. But then we add a message.
    await new Promise(resolve => setTimeout(resolve, 100));
    initial_message();

    global.comment_disposables.push(vscode.commands.registerCommand("refactaicmd.sendChatToSidebar", async (e) => {
        let question = "```\n" + code_snippet + "\n```\n\n" + text;
        activate_chat(messages, question, editor, false);
    }));

    global.comment_disposables.push(vscode.commands.registerCommand("refactaicmd.closeInlineChat", (...args) => {
        global.comment_disposables.forEach(disposable => {
            disposable.dispose();
        });
        global.comment_disposables = [];
    }));
}

function activate_cmd(cmd: string, editor: vscode.TextEditor, messages: rconsoleCommands.Messages, update_thread_callback: rconsoleCommands.ThreadCallback, end_thread_callback: rconsoleCommands.ThreadEndCallback)
{
    console.log(`activate_cmd refactaicmd.cmd_${cmd}`);
    vscode.commands.executeCommand("setContext", "refactaicmd.runningChat", true);
    vscode.commands.executeCommand("refactaicmd.cmd_" + cmd, editor.document.uri.toString(), messages, update_thread_callback, end_thread_callback);
}

async function activate_chat(messages: [string, string][], question: string, editor: vscode.TextEditor, new_question = true)
{
    console.log(`activate_chat question.length=${question.length}`);
    refact_console_close();
    await vscode.commands.executeCommand("refactai-toolbox.focus");
    for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (global.side_panel && global.side_panel._view) {
            break;
        }
    }
    let chat: chatTab.ChatTab|undefined = await sidebar.open_chat_tab(
        question,
        editor,
        false,
        "",
        messages,
        "");
    if (!chat) {
        return;
    }

    if(new_question) {
        await chat.post_question_and_communicate_answer(
            question,
            "",
            "",
            false,
            messages,
            );
    } else {
        await chat.chatHistoryProvider.save_messages_list(chat.chat_id, messages, "");
    }

}

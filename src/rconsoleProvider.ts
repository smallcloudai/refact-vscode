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

// class MyCommentReaction implements vscode.CommentReaction {
//     label: string;
//     iconPath: string | vscode.Uri;
//     count: number;
//     authorHasReacted: boolean;
//     constructor(label: string, iconPath: vscode.Uri, count: number = 0, authorHasReacted: boolean = false) {
//         this.label = label;
//         this.iconPath = iconPath;
//         this.count = count;
//         this.authorHasReacted = authorHasReacted;
//     }
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
    let my_comments: vscode.Comment[] = [];

    let thread: vscode.CommentThread = cc.createCommentThread(
        editor.document.uri,
        new vscode.Range(official_selection.start.line, 0, official_selection.end.line, 0),
        my_comments,
    );
    thread.canReply = true;
    thread.label = "Refact Console (F1)";
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;

    global.comment_disposables.push(thread);
    global.comment_disposables.push(cc);

    let messages: [string, string][] = rconsoleCommands.initial_messages(working_on_attach_filename, working_on_attach_code);

    // TODO:
    // * always operate on messages
    // * write a function that translates messages to comments, call it often
    // * split this function

    const update_thread_callback: rconsoleCommands.ThreadCallback = (author_role, answer) => {
        // if (thread.canReply) { thread.canReply = false; }
        const lastPost = thread.comments.length > 0 ? thread.comments[thread.comments.length - 1] : null;
        const comment = new MyComment(answer, vscode.CommentMode.Preview, new MyCommentAuthorInformation(author_role));

        if(lastPost && lastPost.author.name === author_role && lastPost instanceof MyComment) {

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
        vscode.commands.executeCommand("setContext", "refactaicmd.openSidebarButtonEnabled", true);
    };
    let text = "";
    let hint_debounce: NodeJS.Timeout|undefined;
    let did1 = vscode.workspace.onDidChangeTextDocument(async e => {
        if (e.document.uri.scheme !== "comment") {
            return;
        }
        if (my_comments.length === 0) {
            return;
        }
        text = e.document.getText();
        console.log("onDidChangeTextDocument", text);
        // let y = e.document.fileName;  // "/commentinput-8d64259c-9607-4048-a9dc-a73f621e750d-1.md"
        let top1 = "";
        if (messages.length === 1) {
            let hint, author;
            [hint, author, top1] = rconsoleCommands.get_hints(messages, text, official_selection);
            my_comments[0] = new MyComment(hint, vscode.CommentMode.Preview, new MyCommentAuthorInformation(author));
            if (hint_debounce) {
                clearTimeout(hint_debounce);
            }
            hint_debounce = setTimeout(async () => {
                // this is a heavy operation, changes the layout and lags the UI
                thread.comments = my_comments;
            }, 200);
        }
        await vscode.commands.executeCommand('setContext', 'refactcx.runEsc', true);
        if (top1 && text.match(/\/[a-zA-Z0-9_]+[\t ]$/)) {
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

        if (text.includes("\n")) {
            let comment_editor = vscode.window.visibleTextEditors.find((e1) => {
                return e1.document.uri === e.document.uri;
            });
            let first_line = text.split("\n")[0];
            if (first_line.startsWith("/")) {
                for (let cmd in rconsoleCommands.commands_available) {
                    if (first_line.startsWith("/" + cmd)) {
                        vscode.commands.executeCommand("setContext", "refactaicmd.openSidebarButtonEnabled", false);
                        if (comment_editor) {
                            await comment_editor.edit(edit => {
                                edit.delete(new vscode.Range(0, 0, 1000, 0));
                            });
                        }
                        activate_cmd(cmd, editor, update_thread_callback, end_thread_callback);
                        return;
                    }
                }
            } else {
                let question = "```\n" + code_snippet + "\n```\n\n" + text;
                activate_chat(messages, question, editor);
            }
        }
    });
    let did2 = vscode.workspace.onDidCloseTextDocument(e => {
        if (e.uri.scheme !== "comment") {
            return;
        }
        refact_console_close();
    });
    global.comment_disposables.push(did1);
    global.comment_disposables.push(did2);
    await vscode.commands.executeCommand('setContext', 'refactcx.runEsc', true);
    function initial_message()
    {
        let [hint, author, _top1] = rconsoleCommands.get_hints(messages, "", official_selection);
        my_comments.push(new MyComment(hint, vscode.CommentMode.Preview, new MyCommentAuthorInformation(author)));
        thread.comments = my_comments;
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

function activate_cmd(cmd: string, editor: vscode.TextEditor, update_thread_callback: rconsoleCommands.ThreadCallback, end_thread_callback: rconsoleCommands.ThreadEndCallback)
{
    console.log(`activate_cmd refactaicmd.cmd_${cmd}`);

    vscode.commands.executeCommand("setContext", "refactaicmd.runningChat", true);
    vscode.commands.executeCommand("refactaicmd.cmd_" + cmd, editor.document.uri.toString(), update_thread_callback, end_thread_callback);
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
    }

}

/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as estate from "./estate";


class MyCommentAuthorInformation implements vscode.CommentAuthorInformation {
    name: string;
    iconPath?: vscode.Uri;
    constructor(name: string, iconPath?: vscode.Uri) {
        this.name = name;
        this.iconPath = iconPath;
    }
}

class MyComment implements vscode.Comment {
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


export async function super_test(editor: vscode.TextEditor)
{
    if (global.comment_disposables) {
        for (let d of global.comment_disposables) {
            d.dispose();
        }
    }

    let selected_range = editor.selection;
    let line0 = selected_range.start.line;
    let line1 = selected_range.end.line;
    let selected_lines_range = new vscode.Range(line0, 0, line1, 0);
    // global.test_comments = vscode.comments.createCommentController("refactai-test", "RefactAI Test Comments");
    let cc = vscode.comments.createCommentController("refactai-test", "RefactAI Test Comments");
    cc.commentingRangeProvider = {
        provideCommentingRanges: (document: vscode.TextDocument) => {
            return [selected_lines_range];
            // return [new vscode.Range(line0, 0, line1, 0)];
            // return [new vscode.Range(0, 0, document.lineCount - 1, 0)];
        },
    };
    cc.reactionHandler = (comment: vscode.Comment, reaction: vscode.CommentReaction): Thenable<void> => {
        console.log("reactionHandler", comment, reaction);
        return Promise.resolve();
    };
    vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.uri.scheme !== "comment") {
            return;
        }
        let text = e.document.getText();
        console.log("onDidChangeTextDocument", text);
    });
    vscode.workspace.onDidCloseTextDocument(e => {
        if (e.uri.scheme !== "comment") {
            return;
        }
        console.log("onDidCloseTextDocument", e);
    });

    console.log("super_test");
    let my_comments: vscode.Comment[] = [
        // new MyComment("hello", vscode.CommentMode.Preview, new MyCommentAuthorInformation("me")),
        // new MyComment("world", vscode.CommentMode.Preview, new MyCommentAuthorInformation("you")),
    ];
    let thread: vscode.CommentThread = cc.createCommentThread(
        editor.document.uri,
        new vscode.Range(selected_range.start.line, 0, selected_range.end.line, 0),
        my_comments,
    );
    thread.canReply = true;
    thread.label = "Refact Command (F1)";
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    // console.log("thread", thread);
    // global_thread = thread;
    global.comment_disposables = [];
    global.comment_disposables.push(thread);
    global.comment_disposables.push(cc);
    await new Promise(resolve => setTimeout(resolve, 100));
    my_comments.push(
        new MyComment("<a href=\"x\">Make code shorter</a><br>\n<a href=\"x\">Comment each line</a>", vscode.CommentMode.Preview, new MyCommentAuthorInformation("Hints"))
    );
    thread.comments = my_comments;
}

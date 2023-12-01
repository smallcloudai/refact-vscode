/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchAPI from "./fetchAPI";
import * as chatTab from "./chatTab";
import * as estate from "./estate";


export type ThreadCallback = (role: string, answer: string) => void;
export type Messages = [string, string][];
export type ThreadEndCallback = (messages: Messages) => void;



export let commands_available: { [key: string]: string } = {
"shorter": "Make code shorter",
"bugs": "Find and fix bugs",
"improve": "Rewrite this specific code block of code to improve it",
"comment": "Comment each line",
"typehints": "Add type hints",
"naming": "Improve variable names",
"explain": "Explain code",
};


export function createCommandName(command: string): string {
    return `run_rconsole_command_${command}`;
}

function similarity_score(a: string, b: string): number {
    let score = 0;
    let digrams1 = get_digrams(a);
    let digrams2 = get_digrams(b);
    let chars1 = get_chars(a);
    let chars2 = get_chars(b);
    digrams1 = new Set([...digrams1, ...chars1]);
    digrams2 = new Set([...digrams2, ...chars2]);
    let intersection = new Set([...digrams1].filter(x => digrams2.has(x)));
    let union = new Set([...digrams1, ...digrams2]);
    score = intersection.size / union.size;
    return score;
}

function get_digrams(str: string): Set<string>
{
    let digrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
        let digram = str.substring(i, i + 2);
        digrams.add(digram);
    }
    return digrams;
}

function get_chars(str: string): Set<string>
{
    let chars = new Set<string>();
    for (let i = 0; i < str.length; i++) {
        let char = str.substring(i, i + 1);
        chars.add(char);
    }
    return chars;
}

export function get_hints(
    msgs: Messages,
    unfinished_text: string,
    selected_range: vscode.Range
): [string, string, string] {
    if (unfinished_text.startsWith("/")) {
        let cmd_score: { [key: string]: number } = {};
        for (let cmd in commands_available) {
            let text = commands_available[cmd] || "";
            let score = similarity_score(unfinished_text, "/" + cmd + " " + text);
            cmd_score[cmd] = score;
        }
        let sorted_cmd_score = Object.entries(cmd_score).sort((a, b) => b[1] - a[1]);
        let top3 = sorted_cmd_score.slice(0, 3);
        let result = "";
        for (let i = 0; i < top3.length; i++) {
            let cmd = top3[i][0];
            const cmd_name = createCommandName(cmd);
            let text = commands_available[cmd] || "";
            result += `[**/${cmd}** ${text}](command:${cmd_name})<br />\n`;
        }
        return [result, "Available commands:", top3[0][0]];
    } else {
        if (!selected_range.isEmpty) {
            let lines_n = selected_range.end.line - selected_range.start.line + 1;
            return [`How to change these ${lines_n} lines? Also try "explain this" or commands starting with \"/\".`, "🪄 Selected text", ""];
        } else {
            return [`What would you like to generate? Also try commands starting with \"/\".`, "🪄 New Code", ""];
        }
    }
}

export function initial_messages(working_on_attach_filename: string, working_on_attach_code: string, attached_range: vscode.Range)
{
    let messages: Messages = [];
    if (!working_on_attach_filename) {
        // this should not happen, because we started from a file
        return messages;
    }
    let single_file_json = JSON.stringify([{
        "file_name": working_on_attach_filename,
        "file_content": working_on_attach_code,
        "line1": attached_range.start.line,
        "line2": attached_range.end.line,
    }]);
    messages.push(["context_file", single_file_json]);
    return messages;
}

export async function stream_chat_without_visible_chat(
    messages: Messages,
    editor: vscode.TextEditor,
    selected_range: vscode.Range,
    cancelToken: vscode.CancellationToken,
    thread_callback: ThreadCallback,
    end_thread_callback: ThreadEndCallback,
) {
    let state = estate.state_of_editor(editor, "invisible_chat");
    if (!state) {
        console.log("stream_chat_without_visible_chat: no state found");
        return;
    }
    state.showing_diff_for_range = selected_range;
    await estate.switch_mode(state, estate.Mode.DiffWait);
    // Don't need anymore: user is already entertained
    // interactiveDiff.animation_start(editor, state); // this is an async function, active until the state is still DiffWait

    let answer = "";
    let answer_role = "";
    async function _streaming_callback(json: any)
    {
        if (typeof json !== "object") {
            return;
        }
        if (cancelToken.isCancellationRequested) {
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
                answer_role = role0;
            }
            if(answer_role && answer) {
                thread_callback(answer_role, answer);
            }
        }
    }

    async function _streaming_end_callback(error_message: string)
    {
        console.log("streaming end callback, error: " + error_message);
        if (!error_message) {
            messages.push([answer_role, answer]);
            let answer_by_backquote = answer.split("```");
            let code_blocks = [];
            for (let i=1; i<answer_by_backquote.length; i+=2) {
                code_blocks.push(answer_by_backquote[i]);
            }
            let largest_block = "";
            for (let block of code_blocks) {
                if (block.length > largest_block.length) {
                    largest_block = block;
                }
            }

            end_thread_callback(messages);

            if (largest_block) {
                let last_affected_line = chatTab.diff_paste_back(
                    editor,
                    selected_range,
                    largest_block,
                );
            } else {
                let state = estate.state_of_document(editor.document);
                if (state) {
                    await estate.switch_mode(state, estate.Mode.Normal);
                }
            }
        } else {
            let state = estate.state_of_editor(editor, "streaming_end_callback");
            if (state) {
                await estate.switch_mode(state, estate.Mode.Normal);
            }
        }
    }

    let request = new fetchAPI.PendingRequest(undefined, cancelToken);
    request.set_streaming_callback(_streaming_callback, _streaming_end_callback);
    let third_party = true;  // FIXME
    request.supply_stream(...fetchAPI.fetch_chat_promise(
        cancelToken,
        "chat-tab",
        messages,
        "",
        third_party,
    ));
}

function _run_command(cmd: string, doc_uri: string, messages: Messages, update_thread_callback: ThreadCallback, end_thread_callback: ThreadEndCallback)
{
    let text = commands_available[cmd] || "";
    let editor = vscode.window.visibleTextEditors.find((e) => {
        return e.document.uri.toString() === doc_uri;
    });
    if (!editor) {
        console.log("_run_command: no editor found for " + doc_uri);
        let editor2 = vscode.window.visibleTextEditors.find((e) => {
            return e.document.uri.toString() === doc_uri;
        });
        console.log("_run_command: editor2", editor2);
        return;
    }
    let [official_selection, attach_range, working_on_attach_code, working_on_attach_filename, code_snippet] = chatTab.attach_code_from_editor(editor);
    const messageWithUserInput = [
        ...messages
    ];
    const formatted_question = code_snippet ?  "```\n" + code_snippet + "\n```\n\n" + text + "\n" : `\n${text}\n`;
    messageWithUserInput.push(["user", formatted_question]);
    let cancellationTokenSource = new vscode.CancellationTokenSource();
    let cancellationToken = cancellationTokenSource.token;
    editor.selection = new vscode.Selection(editor.selection.start, editor.selection.start);
    stream_chat_without_visible_chat(
        messageWithUserInput,
        editor,
        official_selection,
        cancellationToken,
        update_thread_callback,
        end_thread_callback
    );
}

export function register_commands(): vscode.Disposable[]
{
    let dispos = [];

    for (let cmd in commands_available) {
        let d = vscode.commands.registerCommand('refactaicmd.cmd_' + cmd, (doc_uri, messages: Messages, update_thread_callback: ThreadCallback, end_thread_callback: ThreadEndCallback) => {
            _run_command(cmd, doc_uri, messages, update_thread_callback, end_thread_callback);
        });
        dispos.push(d);
    }
    return dispos;
}

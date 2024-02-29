/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchAPI from "./fetchAPI";
import * as chatTab from "./chatTab";
import * as estate from "./estate";


export type ThreadCallback = (role: string, answer: string) => void;
export type Messages = [string, string][];
export type ThreadEndCallback = (messages: Messages) => void;


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

export async function get_hints(
    msgs: Messages,
    unfinished_text: string,
    selected_range: vscode.Range,
    model_name: string,
): Promise<[string, string, string]> {

    const toolbox_config = await ensure_toolbox_config();
    const commands_available = toolbox_config?.toolbox_commands;

    if (unfinished_text.startsWith("/") && commands_available) {
        let cmd_score: { [key: string]: number } = {};
        for (let cmd in commands_available) {
            let text = commands_available[cmd].description || "";
            let score = similarity_score(unfinished_text, "/" + cmd + " " + text);
            cmd_score[cmd] = score;
        }
        let sorted_cmd_score = Object.entries(cmd_score).sort((a, b) => b[1] - a[1]);
        let top3 = sorted_cmd_score.slice(0, 3);
        let result = "";
        for (let i = 0; i < top3.length; i++) {
            let cmd = top3[i][0];
            const cmd_name = createCommandName(cmd);
            let text = commands_available[cmd].description || "";
            result += `[**/${cmd}** ${text}](command:${cmd_name})<br />\n`;
        }

        // TODO: find  how to link to a file
        result += "\n[Customize these commands]()\n";
        return [result, "Available commands:", top3[0][0]];
    } else {
        if (!selected_range.isEmpty) {
            let lines_n = selected_range.end.line - selected_range.start.line + 1;
            return [
                `How to change these ${lines_n} lines? Also try "explain this" or commands starting with \"/\".\n\n` +
                `Model: ${model_name}\n`,
                "🪄 Selected text", ""];
        } else {
            return [
                `What would you like to generate? Also try commands starting with \"/\".\n\n` +
                `Model: ${model_name}\n`,
                "🪄 New Code", ""];
        }
    }
}

export function initial_messages(working_on_attach_filename: string, working_on_attach_code: string, attached_range: vscode.Range)
{
    // NOTE: this is initial messages for a chat without a command. With command it will get the structure from the command.
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
    model_name: string,
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
            let error_message_escaped = error_message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            messages.push(["error", "When sending the actual request, an error occurred:\n\n" + error_message_escaped]);
            end_thread_callback(messages);
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
        model_name,
        third_party,
    ));
}


async function _run_command(cmd: string, doc_uri: string, model_name: string, update_thread_callback: ThreadCallback, end_thread_callback: ThreadEndCallback)
{

    const toolbox_config = await ensure_toolbox_config();
    if(!toolbox_config) {
        console.log(["_run_command: no toolbox config found", doc_uri]);
        return;
    }
    let arg = "";
    const cmd_dict = toolbox_config?.toolbox_commands[cmd];
    // let text = toolbox_config?.toolbox_commands[cmd].description ?? "";
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

    let [official_selection1, attach_range1, working_on_attach_code, working_on_attach_filename, code_snippet] = chatTab.attach_code_from_editor(editor, false);
    let code_around_cursor_json = JSON.stringify([{
        "file_name": working_on_attach_filename,
        "file_content": working_on_attach_code,
        "line1": attach_range1.start.line,
        "line2": attach_range1.end.line,
    }]);

    let [official_selection2, attach_range2, working_on_attach_code_insert_here] = chatTab.attach_code_from_editor(editor, true);
    let code_insert_here_json = JSON.stringify([{
        "file_name": working_on_attach_filename,
        "file_content": working_on_attach_code_insert_here,
        "line1": attach_range2.start.line,
        "line2": attach_range2.end.line,
    }]);

    const messages: [string, string][] = [];
    let cmd_messages = cmd_dict["messages"];
    for (let i=0; i<cmd_messages.length; i++) {
        let {role, content: text} = cmd_messages[i];
        text = text.replace("$ARG", arg);
        text = text.replace("$CODE_INSERT_HERE_JSON", code_insert_here_json);
        text = text.replace("$CODE_AROUND_CURSOR_JSON", code_around_cursor_json);
        text = text.replace("$CODE_SELECTION", code_snippet);
        messages.push([role, text]);
    }

    let cancellationTokenSource = new vscode.CancellationTokenSource();
    let cancellationToken = cancellationTokenSource.token;
    editor.selection = new vscode.Selection(editor.selection.start, editor.selection.start);
    stream_chat_without_visible_chat(
        messages,
        model_name,
        editor,
        official_selection1,
        cancellationToken,
        update_thread_callback,
        end_thread_callback
    );
}


export async function register_commands(): Promise<void> {
    global.toolbox_command_disposables.forEach(disposable => disposable.dispose());
    global.toolbox_command_disposables = [];
    try {

        const toolbox_config = await ensure_toolbox_config();
        const commands_available = toolbox_config?.toolbox_commands;

        for (let cmd in commands_available) {
            let d = vscode.commands.registerCommand('refactaicmd.cmd_' + cmd,
                async (doc_uri, model_name: string, update_thread_callback: ThreadCallback, end_thread_callback: ThreadEndCallback) => {
                    if (!model_name) {
                        [model_name,] = await chatTab.chat_model_get();
                    }
                    _run_command(cmd, doc_uri, model_name, update_thread_callback, end_thread_callback);
                }
            );
            global.toolbox_command_disposables.push(d);
        }
    } catch (e) {
        console.log(["register_commands error", e]);
    }
}

export async function ensure_toolbox_config() {
    if (global.toolbox_config) { return global.toolbox_config; }
    return global.rust_binary_blob?.fetch_toolbox_config();
}
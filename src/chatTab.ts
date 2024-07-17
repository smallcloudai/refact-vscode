
/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as fetchAPI from "./fetchAPI";
import * as crlf from "./crlf";
import * as estate from "./estate";
import ChatHistoryProvider, { Chat } from "./chatHistory";
import { basename } from "path";

const Diff = require("diff"); // Documentation: https://github.com/kpdecker/jsdiff/

// circular dependency
import { open_chat_tab } from "./sidebar";

import {
	EVENT_NAMES_FROM_CHAT,
	EVENT_NAMES_TO_CHAT,
	EVENT_NAMES_TO_CONFIG,
	type ChatSetSelectedSnippet,
	type ReceiveAtCommandCompletion,
	type ReceiveAtCommandPreview,
	type Snippet,
	type ChatContextFile,
	type ToggleActiveFile,
	type RestoreChat,
	type ActiveFileInfo,
	type ChatMessages,
	type ReceiveTokenCount,
	type FileInfo,
	type UpdateConfigMessage,
	type RequestPrompts,
	type ReceivePromptsError,
	type ReceivePrompts,
	type RequestPreviewFiles,
    type ChatMessage,
    type SetChatModel,
    RequestTools,
    ToolCommand,
    RecieveTools,
    QuestionFromChat
} from "refact-chat-js/dist/events";



export function attach_code_from_editor(editor: vscode.TextEditor, insert_here_tag: boolean): [vscode.Range, vscode.Range, string, string, string]
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
    let pos0 = selection.start;
    let pos1 = selection.end;
    let attach = "";
    while (1) {
        let attach_before = editor.document.getText(new vscode.Range(pos0, selection.start));
        let attach_after = editor.document.getText(new vscode.Range(selection.start, pos1));
        let attach_test = attach_before + `${insert_here_tag ? "\n|INSERT-HERE|\n" : ""}` + attach_after;
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
    return [selection, attach_range, attach, fn, code_snippet];
}


export class ChatTab {
  // public static current_tab: ChatTab | undefined;
    private _disposables: vscode.Disposable[] = [];
    public messages: ChatMessages = [];
    public cancellationTokenSource: vscode.CancellationTokenSource;
    public working_on_attach_filename: string = "";
    public working_on_attach_code: string = "";
    public working_on_attach_range: vscode.Range | undefined = undefined;
    public working_on_snippet_code: string = "";
    public working_on_snippet_range: vscode.Range | undefined = undefined;
    public working_on_snippet_editor: vscode.TextEditor | undefined = undefined;
    public working_on_snippet_column: vscode.ViewColumn | undefined = undefined;
    public model_to_thirdparty: { [key: string]: boolean } = {};
    private default_chat_model: undefined|string;

    public get_messages(): ChatMessages {
        return this.messages;
    }

    public constructor(
        public web_panel: vscode.WebviewPanel | vscode.WebviewView,
        public chatHistoryProvider: ChatHistoryProvider,
        public chat_id = ""
    ) {
        this.cancellationTokenSource = new vscode.CancellationTokenSource();
        this.handleEvents = this.handleEvents.bind(this);
        this.handleStreamEnd = this.handleStreamEnd.bind(this);
        this.dispose = this.dispose.bind(this);

        this._disposables.push(vscode.window.onDidChangeActiveTextEditor(() => {
          this.postActiveFileInfo();
          this.sendSnippetToChat();
        }));

        this._disposables.push(vscode.window.onDidChangeTextEditorSelection(() => {
          this.postActiveFileInfo();
          this.sendSnippetToChat();
        }));

        this._disposables.push(vscode.workspace.onDidChangeConfiguration(event => {
            if(event.affectsConfiguration("refactai.vecdb") || event.affectsConfiguration("refactai.ast")) {
                this.handleSettingsChange();
            }
        }));

        this._disposables.push(this.web_panel.onDidDispose(this.dispose));
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
        if(this.messages.length > 0) {
          this.chatHistoryProvider.save_messages_list(
            this.chat_id,
            this.messages,
            history?.chatModel || "",
            history?.chat_title
          );
        }

        if (!global.side_panel?.chat) {
          global.side_panel?.goto_main();
        }
    }

    static async open_chat_in_new_tab(chatHistoryProvider: ChatHistoryProvider, chat_id: string, extensionUri: string, append_snippet_to_input: boolean) {

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
            truncate(`Refact.ai ${chat_title}`, 24),
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

        await tab._clear_and_repopulate_chat(chat_title, undefined, false, chatModel, messages, append_snippet_to_input);
    }

    async restoreChat(chat: {
        id: string;
        messages: ChatMessages,
        title?: string;
        model: string;
    }, appendSnippet = false) {
        const [model] = chat.model ? [chat.model] : await chat_model_get();
        const snippet = appendSnippet ? this.getSnippetFromEditor(): undefined;
        // TODO: fix cast this
        const messages = chat.messages as ChatMessages;
        this.chat_id = chat.id;
        return new Promise<void>((resolve) => {
            const disposables: vscode.Disposable[] = [];
            const restore = (event: { type: string }) => {
                if (event.type === EVENT_NAMES_FROM_CHAT.READY) {

                    const action: RestoreChat = {
                        type: EVENT_NAMES_TO_CHAT.RESTORE_CHAT,
                        payload: {
                          id: this.chat_id,
                          chat: {
                            ...chat,
                            messages,
                            attach_file: !!snippet,
                            model
                          },
                          snippet
                        }
                    };

                    this.web_panel.webview.postMessage(action);

                    this.postActiveFileInfo();
                    this.toggleAttachFile(!!this.working_on_snippet_code);
                    this.sendTokenCountToChat();
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

    trimIndent(code: string) {
        if(/^\s/.test(code) === false) { return code; }
        const lastLine = code.split("\n").slice(-1)[0];
        if(/^\s/.test(lastLine) === false) { return code; }
        const tabSettings = vscode.workspace.getConfiguration("editor").get<number>("tabSize") ?? 4;
        const spaces = " ".repeat(tabSettings);
        const spacedCode = code.replace(/^\t+/gm, (match) => {
            return match.replace(/\t/g, spaces);
        });
        const regexp = new RegExp(`^${spaces}`, "gm");
        const indented = spacedCode.replace(regexp, "");
        return indented;
    }

    getSnippetFromEditor(): Snippet {
        // if(!this.working_on_snippet_code) { return; }
        const language = vscode.window.activeTextEditor?.document.languageId ?? "";
        const isEmpty = vscode.window.activeTextEditor?.selection.isEmpty ?? true;
        const selection = vscode.window.activeTextEditor?.selection;
        const code = isEmpty ? "" : vscode.window.activeTextEditor?.document.getText(selection) ?? "";
        const filePath = vscode.window.activeTextEditor?.document.fileName?? "";
        const fileName = basename(filePath);


        const indentedCode = this.trimIndent(code);

        this.working_on_snippet_editor = vscode.window.activeTextEditor;
        this.working_on_snippet_range = selection;
        this.working_on_snippet_code = indentedCode;
        this.working_on_snippet_column = this.working_on_snippet_editor?.viewColumn;

        return {
            code: indentedCode,
            language,
            path: filePath,
            basename: fileName
        };
    }

    sendSnippetToChat(id?: string) {
        const snippet = this.getSnippetFromEditor();
        const action: ChatSetSelectedSnippet = {
            type: EVENT_NAMES_TO_CHAT.SET_SELECTED_SNIPPET,
            payload: { id: id || this.chat_id, snippet }
        };
        this.web_panel.webview.postMessage(action);
    }

    toggleAttachFile(attach_file: boolean) {
        const action: ToggleActiveFile = {
            type: EVENT_NAMES_TO_CHAT.TOGGLE_ACTIVE_FILE,
            payload: { id: this.chat_id, attach_file, }
        };

        this.web_panel.webview.postMessage(action);
    }

    sendTokenCountToChat() {
        const action: ReceiveTokenCount = {
            type: EVENT_NAMES_TO_CHAT.RECEIVE_TOKEN_COUNT,
            payload: {
                id: this.chat_id,
                tokens: global.user_logged_in ? global.user_metering_balance : null
            }
        };

        this.web_panel.webview.postMessage(action);
    }

    // createNewChat() {
    //     const action: CreateNewChatThread = {
    //         type: EVENT_NAMES_TO_CHAT.NEW_CHAT,
    //     };
    //     this.web_panel.webview.postMessage(action);
    // }

    postActiveFileInfo(id = this.chat_id) {
        const file = this.getActiveFileInfo();
        if(file === null) {
            const action: ActiveFileInfo = {
                type: EVENT_NAMES_TO_CHAT.ACTIVE_FILE_INFO,
                payload: { id, file: { can_paste: false } },
            };
            this.web_panel.webview.postMessage(action);
        } else {
            const action: ActiveFileInfo = {
                type: EVENT_NAMES_TO_CHAT.ACTIVE_FILE_INFO,
                payload: { id, file },
            };

            this.web_panel.webview.postMessage(action);
        }
    }

    getActiveFileInfo(): Partial<FileInfo> | null {
        if(vscode.window.activeTextEditor?.document.uri.scheme === "comment") {
            return null;
        }
        const file_path =
			vscode.window.activeTextEditor?.document.fileName || "";
        const file_name = basename(file_path);
        const file_content = vscode.window.activeTextEditor?.document.getText() || "";
        const start = vscode.window.activeTextEditor?.selection.start;
        const end = vscode.window.activeTextEditor?.selection.end;
        const lineCount = vscode.window.activeTextEditor?.document.lineCount ?? 0;
        const cursor = vscode.window.activeTextEditor?.selection.active.line ?? null;
        const can_paste = vscode.window.activeTextEditor?.document.uri.scheme === "file";

        const maybeLineInfo = start !== undefined && end !== undefined && !start.isEqual(end)
            ? { line1: start.line + 1, line2: end.line + 1 }
            : { line1:  1, line2: lineCount + 1 };

        const file = {
            name: file_name,
            content: file_content,
            path: file_path,
            usefulness: 100,
            cursor,
            can_paste,
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
        tools = null,
    }: {
        id: string;
        model: string;
        title?: string;
        // messages: [string, string][];
        messages: ChatMessages;
        attach_file?: boolean;
        tools?: ToolCommand[] | null;
    }): Promise<void> {
        this.web_panel.webview.postMessage({type: EVENT_NAMES_TO_CHAT.SET_DISABLE_CHAT, payload: { id, disable: true }});
        // const file = attach_file && this.getActiveFileInfo();

        // TODO: confirm if context files are no longer sent
        // if (file) {
        //     const message: [string, string] = ["context_file", JSON.stringify([file])];
        //     const tail = messages.splice(-1, 1, message);
        //     tail.map((m) => messages.push(m));
        // }
        this.chat_id = id;
        this.messages = messages;
        this.cancellationTokenSource =
            new vscode.CancellationTokenSource();
        if (model) {
            await chat_model_set(model, ""); // successfully used model, save it
        } else if(this.default_chat_model) {
            await chat_model_set(this.default_chat_model, "");
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
                  ...json,
                  id,
              },
            });
        };

        const request = new fetchAPI.PendingRequest(
            undefined,
            this.cancellationTokenSource.token
        );
        request.set_streaming_callback(
            handle_response,
            (error?: string) => this.handleStreamEnd(id, error),
        );
        //TODO: find out what this is for?
        const third_party = this.model_to_thirdparty[model];

        const formattedMessages = this.messages.map((message:ChatMessage) => {
            if (message[0] === "context_file" && typeof message[1] !== "string") {
                return [message[0], JSON.stringify(message[1])];
            }

            return message;
        }) as ChatMessages;


        const chat_promise = fetchAPI.fetch_chat_promise(
            this.cancellationTokenSource.token,
            "chat-tab",
            formattedMessages,
            model,
            third_party,
            tools
        );

        return request.supply_stream(...chat_promise);
    }

    handleStreamEnd(id: string = this.chat_id, error?: string) {
        if (error) {
            this.web_panel.webview.postMessage({
                type: EVENT_NAMES_TO_CHAT.ERROR_STREAMING,
                payload: {
                    id,
                    message: error,
                },
            });
        } else {
            this.web_panel.webview.postMessage({
                type: EVENT_NAMES_TO_CHAT.DONE_STREAMING,
                payload: { id },
            });
            this.sendTokenCountToChat();
        }
    }

    async handleAtCommandCompletion(payload: { id: string; query: string; cursor: number; trigger: string | null; number: number }) {
        fetchAPI.getAtCommands(
            payload.trigger ?? payload.query,
            payload.trigger ? payload.trigger.length : payload.cursor,
            payload.number
        ).then((res) => {
            const message: ReceiveAtCommandCompletion = {
                type: EVENT_NAMES_TO_CHAT.RECEIVE_AT_COMMAND_COMPLETION,
                payload: { id: payload.id, ...res },
            };

            this.web_panel.webview.postMessage(message);
        }).catch(() => ({}));
    }

    async handlePreviewFileRequest(payload: {id: string, query: string}) {
        fetchAPI
            .getAtCommandPreview(payload.query)
            .then((res) => {
                const message: ReceiveAtCommandPreview = {
                    type: EVENT_NAMES_TO_CHAT.RECEIVE_AT_COMMAND_PREVIEW,
                    payload: { id: payload.id, preview: res },
                };

                this.web_panel.webview.postMessage(message);
            })
            .catch(() => ({}));
    }

    async handleEvents({ type, ...data }: any) {
        switch (type) {

            case EVENT_NAMES_FROM_CHAT.ASK_QUESTION: {
                // Note: context_file will be a different format
                const payload: QuestionFromChat["payload"] = data.payload;
                const { id, messages, title, model, attach_file, tools } = payload;
                return this.handleChatQuestion({ id, model, title, messages, attach_file, tools  });
            }

            case EVENT_NAMES_FROM_CHAT.REQUEST_CAPS: {
                return fetchAPI
                    .get_caps()
                    .then((caps) => {
                        this.default_chat_model = caps.code_chat_default_model;
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
                return this.handleStopClicked();
            }

            case EVENT_NAMES_FROM_CHAT.READY: {
                const { id } = data.payload;
                this.chat_id = id;
                this.setChatModel(id);
                this.sendSnippetToChat(id);
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

            case EVENT_NAMES_FROM_CHAT.REQUEST_AT_COMMAND_COMPLETION: {
                return this.handleAtCommandCompletion(data.payload);
            }

            case EVENT_NAMES_FROM_CHAT.REQUEST_PROMPTS: {
              const action: RequestPrompts = data;
              return this.handleCustomPromptsRequest(action.payload.id);
            }

            case EVENT_NAMES_FROM_CHAT.REQUEST_PREVIEW_FILES: {
				const acton: RequestPreviewFiles = data;
				return this.handlePreviewFileRequest(acton.payload);
			}

            case EVENT_NAMES_FROM_CHAT.REQUEST_TOOLS: {
                const action: RequestTools = data;
                return this.handleToolRequest(action.payload.id);
            }

            case EVENT_NAMES_FROM_CHAT.OPEN_SETTINGS: {
                return this.handleOpenSettings();
            }

            // case EVENT_NAMES_FROM_CHAT.BACK_FROM_CHAT: {
            // // handled in sidebar.ts
            // }

            // case EVENT_NAMES_FROM_CHAT.OPEN_IN_CHAT_IN_TAB: {
            //  // handled in sidebar.ts
            // }

        }
    }

    async handleOpenSettings() {
        return vscode.commands.executeCommand("workbench.action.openSettings", "refactai");
    }

    async setChatModel(id: string) {
        const [model] = await chat_model_get();
        const message: SetChatModel = {
            type: EVENT_NAMES_TO_CHAT.SET_CHAT_MODEL,
            payload: {id, model}
        };

        this.web_panel.webview.postMessage(message);
    }

    async handleToolRequest(id: string) {

        fetchAPI.get_tools().then((res) => {
            const action: RecieveTools = {
                type: EVENT_NAMES_TO_CHAT.RECEIVE_TOOLS,
                payload: { id, tools: res },
            };
            this.web_panel.webview.postMessage(action);
        }).catch((err) => {
            const action: RecieveTools = {
                type: EVENT_NAMES_TO_CHAT.RECEIVE_TOOLS,
                payload: { id, tools: [] },
            };
            this.web_panel.webview.postMessage(action);
        });
    }

    async handleCustomPromptsRequest(id: string) {
        return fetchAPI.get_prompt_customization().then((data) => {
          const message: ReceivePrompts = {
				    type: EVENT_NAMES_TO_CHAT.RECEIVE_PROMPTS,
				    payload: { id, prompts: data.system_prompts },
			    };

          return this.web_panel.webview.postMessage(message);

        }).catch((err: string) => {
            const message: ReceivePromptsError = {
                type: EVENT_NAMES_TO_CHAT.RECEIVE_PROMPTS_ERROR,
                payload: { id, error: `Prompts: ${err}` },
            };
            return this.web_panel.webview.postMessage(message);
        });
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
			const range = this.working_on_snippet_editor.selection;
			const snippet = new vscode.SnippetString(data.code_block);
			vscode.window.activeTextEditor?.insertSnippet(snippet, range);
			return;
		};

        // indent block
        const startOfLine = new vscode.Position(this.working_on_snippet_range.start.line, 0);
        const endOfLine = new vscode.Position(this.working_on_snippet_range.start.line + 1, 0);
        const firstLineRange = new vscode.Range(startOfLine, endOfLine);
        const spaceRegex = /^[ \t]+/;
        const selectedLine = this.working_on_snippet_editor.document.getText(
            firstLineRange
        );
        const indent = selectedLine.match(spaceRegex)?.[0] ?? "";
        const code = "\n" + data.code_block + "\n";
        const indentedCode = code.replace(/\n/mg, "\n" + indent);

        const range = new vscode.Range(startOfLine, this.working_on_snippet_range.end);

		return diff_paste_back(
            this.working_on_snippet_editor,
            range,
            indentedCode
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

    public static async clear_and_repopulate_chat(
        question: string,
        editor: vscode.TextEditor | undefined,
        attach_default: boolean,
        use_model: string,
        messages: ChatMessages,
        append_snippet_to_input: boolean = false,
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

        await free_floating_tab._clear_and_repopulate_chat(question, editor, attach_default, use_model, messages, append_snippet_to_input);
    }

    async _clear_and_repopulate_chat(
        question: string,
        editor: vscode.TextEditor | undefined,
        attach_default: boolean,
        use_model: string,
        messages: ChatMessages,
        append_snippet_to_input: boolean = false
    ) {
        let context: vscode.ExtensionContext | undefined = global.global_context;
        if (!context) {
            return;
        }

        // TODO: find out if this is this needed any more?
        let code_snippet = "";
        this.working_on_snippet_range = undefined;
        this.working_on_snippet_editor = editor;
        this.working_on_snippet_column = undefined;

        if (editor) {
            let selection, attach_range: vscode.Range;
            [selection, attach_range, this.working_on_attach_code, this.working_on_attach_filename, code_snippet] = attach_code_from_editor(editor, false);
            this.working_on_attach_range = attach_range;
            if (!selection.isEmpty) {
                this.working_on_snippet_range = selection;
                this.working_on_snippet_column = editor.viewColumn;
            }

        }
        this.working_on_snippet_code = code_snippet;
        this.messages = messages;

        const chat = {
            id: this.chat_id,
            model: use_model,
            messages,
            title: question,
        };

        return this.restoreChat(chat, append_snippet_to_input);

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

    handleSettingsChange() {
        const vecdb =
            vscode.workspace
                .getConfiguration()
                ?.get<boolean>("refactai.vecdb") ?? false;

        const ast =
            vscode.workspace
                .getConfiguration()
                ?.get<boolean>("refactai.ast") ?? false;
        const message: UpdateConfigMessage = {
            type: EVENT_NAMES_TO_CONFIG.UPDATE,
            payload: {
                features: { vecdb, ast }
            }
        };
        this.web_panel.webview.postMessage(message);
    }


    public get_html_for_chat(
        webview: vscode.Webview,
        extensionUri: any,
        isTab = false
    ): string {
        const vecdb = vscode.workspace
			.getConfiguration()
			?.get<boolean>("refactai.vecdb") ?? false;

        const ast = vscode.workspace.getConfiguration()?.get<boolean>("refactai.ast") ?? false;

        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "node_modules", "refact-chat-js", "dist", "chat", "index.umd.cjs")
        );

        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "node_modules", "refact-chat-js", "dist", "chat", "style.css")
        );

        const styleOverride = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "assets", "custom-theme.css")
        );

        const fontSize = vscode.workspace.getConfiguration().get<number>("editor.fontSize") ?? 12;
        const scaling = fontSize < 14 ? "90%" : "100%";

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
                <meta http-equiv="Content-Security-Policy" content="style-src ${
                  webview.cspSource
                } 'unsafe-inline'; img-src 'self' data: https:; script-src 'nonce-${nonce}'; style-src-attr 'sha256-tQhKwS01F0Bsw/EwspVgMAqfidY8gpn/+DKLIxQ65hg=' 'unsafe-hashes';">
                <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1">

                <title>Refact.ai Chat</title>
                <link href="${styleMainUri}" rel="stylesheet">
                <link href="${styleOverride}" rel="stylesheet">
            </head>
            <body>
                <div id="refact-chat" ${isTab ? "data-state-tabbed" : ""}></div>

                <script nonce="${nonce}" src="${scriptUri}"></script>

                <script nonce="${nonce}">
                window.onload = function() {
                    const root = document.getElementById("refact-chat")
                    RefactChat.render(root, {
                        host: "vscode",
                        tabbed: ${isTab},
                        themeProps: {
                            accentColor: "gray",
                            scaling: "${scaling}",
                        },
                        features: {
                            vecdb: ${vecdb},
                            ast: ${ast},
                        }
                    })
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

    try {
        await global.rust_binary_blob?.read_caps();
    } catch {
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
    // Commented out: allows to insert without selection
    // if (dest_range.isEmpty) {
    //     console.log("diff_paste_back: dest_range is empty");
    //     return -1;
    // }
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
    const changedLines = [...state.diffAddedLines, ...state.diffDeletedLines];
    if (changedLines.length > 0) {
        last_affected_line = Math.max(...changedLines);
    }

    return last_affected_line;
}

function truncate(str: string, length: number): string {
  if (str.length <= length) {
    return str;
  }

  if (length <= 1) {
    return "…";
  }

  return str.slice(0, length - 1) + "…";
}

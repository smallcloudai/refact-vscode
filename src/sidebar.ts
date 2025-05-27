/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import * as chatTab from './chatTab';
import * as statisticTab from './statisticTab';
import * as usabilityHints from "./usabilityHints";
import * as path from 'path';
import { v4 as uuidv4 } from "uuid";
import { getKeyBindingForChat } from "./getKeybindings";
import {
    type ChatMessages,
    fim,
    isLogOut,
    isOpenExternalUrl,
    updateConfig,
    isSetupHost,
    type FileInfo,
    setFileInfo,
    type Snippet,
    setSelectedSnippet,
    type InitialState,
    newChatAction,
    ideOpenHotKeys,
    ideOpenFile,
    ideNewFileAction,
    ideOpenSettingsAction,
    ideDiffPasteBackAction,
    type ChatThread,
    ideAnimateFileStart,
    ideAnimateFileStop,
    ideChatPageChange,
    ideEscapeKeyPressed,
    ideIsChatStreaming,
    setCurrentProjectInfo,
    ideToolCall,
    ToolEditResult,
    ideToolCallResponse,
    ideAttachFileToChat,
    TextDocToolCall,
    ideSetCodeCompletionModel,
    ideSetLoginMessage,
    ideSetActiveTeamsGroup,
    ideClearActiveTeamsGroup,
    OpenFilePayload,
    TeamsGroup
} from "refact-chat-js/dist/events";
import { basename, join } from "path";
import { diff_paste_back } from "./chatTab";
import { execFile } from "child_process";
import * as estate from './estate';
import { animation_start } from "./interactiveDiff";
import {existsSync} from "fs";


type Handler = ((data: any) => void) | undefined;
function composeHandlers(...eventHandlers: Handler[]) {
    return (data: any) => eventHandlers.forEach(fn => fn && fn(data));
}

export async function open_chat_tab(
    question: string,
    editor: vscode.TextEditor | undefined,
    attach_default: boolean,   // checkbox set on start, means attach the current file
    model: string,
    messages: ChatMessages,
    chat_id: string,
    append_snippet_to_input: boolean = false,
): Promise<chatTab.ChatTab|undefined> {
    if (global.side_panel?.chat) {
        global.side_panel.chat = null;
    }

    if (global.side_panel && global.side_panel._view) {
        const chat: ChatThread =  {
            id: uuidv4(),
            messages: question ? [
                ...messages,
                {role: "user", content: question},
            ] : [],
            model: model,
            new_chat_suggested: {
                wasSuggested: false,
            }
        };
        global.side_panel.goto_chat(chat);  // changes html

    }
    return;
}

export class PanelWebview implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _history: string[] = [];
    selected_lines_count: number = 0;
    access_level: number = -1;
    cancel_token: vscode.CancellationToken | undefined = undefined;
    public address: string;

    public chat: chatTab.ChatTab | null = null;
    public statistic: statisticTab.StatisticTab | null = null;
    public tool_edit_in_progress: null | {chatId: string, toolCallId?: string} = null;
    // public fim_debug: fimDebug.FimDebug | null = null;
    // public chatHistoryProvider: ChatHistoryProvider|undefined;

    _disposables: vscode.Disposable[] = [];

    public static readonly viewType = "refactai-toolbox";

    constructor(public readonly context: vscode.ExtensionContext) {
        // this.chatHistoryProvider = undefined;
        this.address = "";
        this.js2ts_message = this.js2ts_message.bind(this);

        this.handleEvents = this.handleEvents.bind(this);
        
        // Check for bring-your-own-key configuration during initialization
        this.checkForBringYourOwnKeyConfig();

        this._disposables.push(vscode.window.onDidChangeActiveTextEditor(() => {
            this.postActiveFileInfo();
            this.sendSnippetToChat();
          }));

        this._disposables.push(vscode.window.onDidChangeTextEditorSelection(() => {
           this.postActiveFileInfo();
           this.sendSnippetToChat();
        }));

        this._disposables.push(vscode.workspace.onDidChangeConfiguration(event => {
            if(
                event.affectsConfiguration("refactai.vecdb") ||
                event.affectsConfiguration("refactai.ast") ||
                event.affectsConfiguration("refactai.submitChatWithShiftEnter") ||
                event.affectsConfiguration("refactai.xperimental")
            ) {
                this.handleSettingsChange();
            }
            if (event.affectsConfiguration("refactai.addressURL")) {
                this.checkForBringYourOwnKeyConfig();
            }
        }));

        this._disposables.push(vscode.workspace.onDidChangeWorkspaceFolders((event) => {
            this.sendCurrentProjectInfo();
        }));


        // this._disposables.push(vscode.workspace.onDidOpenTextDocument((event) => {
        //     console.log("onDidOpenTextDocument");
        //     console.log(event);
        // }));

        // this._disposables.push(vscode.workspace.onDidCloseTextDocument((event) => {
        //     console.log("onDidCloseTextDocument");
        //     console.log(event);
        // }));
        // // workspace onDidOpenTextDocument and onDidCloseTextDocument:

        // TODO: theme changes.
    }

    // handleEvents(data: any) {
    //     if(!this._view) { return; }
    //     return composeHandlers(this.chat?.handleEvents, this.js2ts_message)(data);
    // }

    getOpenFiles(): string[] {
        const openDocuments = vscode.workspace.textDocuments.filter(doc => !doc.isClosed);
        const openFiles = openDocuments.map(document => document.uri.fsPath);
        return openFiles;
    }

    sendSnippetToChat() {
        const snippet = this.getSnippetFromEditor();
        if(!snippet) { return; }
        const message = setSelectedSnippet(snippet);
        this._view?.webview.postMessage(message);
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


        return {
            code: code,
            language,
            path: filePath,
            basename: fileName
        };
    }

    postActiveFileInfo() {
        const file = this.getActiveFileInfo();
        if(file === null) {
            const message = setFileInfo({  name: "",
                line1: null,
                line2: null,
                can_paste: false,
                path: "",
                cursor: null
            });
            this._view?.webview.postMessage(message);
        } else {
            const message = setFileInfo(file);
            this._view?.webview.postMessage(message);
        }
    }

    getActiveFileInfo(): FileInfo | null {
        if(vscode.window.activeTextEditor?.document.uri.scheme !== "file" && vscode.window.activeTextEditor?.document.uri.scheme!== "vscode-userdata") {
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

    getActiveWorkspace(): string | undefined {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
            return workspaceFolder?.name;
        } else {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders?.length === 1) {
                return workspaceFolders[0].name;
            }
        }
    }

    handleSettingsChange() {
        const vecdb =
            vscode.workspace
                .getConfiguration()
                ?.get<boolean>("refactai.vecdb") ?? false;

        const ast =
            vscode.workspace
                .getConfiguration()
                ?.get<boolean>("refactai.ast") ?? false;


        const apiKey = vscode.workspace.getConfiguration()?.get<string>("refactai.apiKey") ?? "";
        const addressURL = vscode.workspace.getConfiguration()?.get<string>("refactai.addressURL") ?? "";
        const port = global.rust_binary_blob?.get_port() ?? 8001;
        const submitChatWithShiftEnter = vscode.workspace.getConfiguration()?.get<boolean>("refactai.submitChatWithShiftEnter")?? false;

        const currentActiveWorkspaceName = this.getActiveWorkspace();

        const message = updateConfig({
            apiKey,
            addressURL,
            lspPort: port,
            shiftEnterToSubmit: submitChatWithShiftEnter,
            features: {vecdb, ast},
            currentWorkspaceName: currentActiveWorkspaceName
        });

        this._view?.webview.postMessage(message);
    }

    public attachFile(path: string) {
        const action = ideAttachFileToChat(path);
        this._view?.webview.postMessage(action);
    }



    public new_statistic(view: vscode.WebviewView)
    {
        this.statistic = new statisticTab.StatisticTab(view);
        return this.statistic;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        cancel_token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        this.cancel_token = cancel_token;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri],
        };
        webviewView.onDidChangeVisibility(() => {
            // do nothing
        });

        this.goto_main();

        vscode.commands.registerCommand('workbench.action.focusSideBar', () => {
            webviewView.webview.postMessage({ command: "focus" });
        });

        webviewView.webview.onDidReceiveMessage(async (data) => {
            this.handleEvents(data);
        });
    }

    /**
     * Checks if user has a 'bring-your-own-key' host type configuration and logs them out
     * as this option is no longer supported
     */
    private async checkForBringYourOwnKeyConfig() {
        const hostType = this.context.globalState.get<string>('refactai.hostType');
        const notificationMessage = "The 'bring-your-own-key' login option is no longer available. Your settings have been cleared. Please choose other login option.";
        
        if (hostType === 'bring-your-own-key') {
            vscode.window.showInformationMessage(
                notificationMessage,
                "Open Settings"
            ).then(selection => {
                if (selection === "Open Settings") {
                    vscode.commands.executeCommand("refactaicmd.openSettings");
                }
            });
            await this.delete_old_settings();
            
            await this.context.globalState.update('refactai.hostType', undefined);
            return;
        }
        
        // Fallback for older versions without stored host type
        const addressURL = vscode.workspace.getConfiguration()?.get<string>("refactai.addressURL") ?? "";
        const apiKey = vscode.workspace.getConfiguration()?.get<string>("refactai.apiKey") ?? "";
        
        const lowerCasedAddressURL = addressURL.toLowerCase();
        if (
            typeof addressURL === 'string' && 
            !lowerCasedAddressURL.startsWith("http://") && 
            !lowerCasedAddressURL.startsWith("https://") && 
            lowerCasedAddressURL.endsWith('.yaml')
        ) {
            vscode.window.showInformationMessage(
                notificationMessage,
                "Open Settings"
            ).then(selection => {
                if (selection === "Open Settings") {
                    vscode.commands.executeCommand("refactaicmd.openSettings");
                }
            });
            
            await this.delete_old_settings();
        }
    }

    public async goto_main()
    {
        await this.checkForBringYourOwnKeyConfig();
        
        this.address = "";
        if (!this._view) {
            return;
        }
        this._view.webview.html = await this.html_main_screen(this._view.webview);
    }

    // can change this to
    public async goto_chat(chat_thread?: ChatThread)
    {
        // this.html_main_screen(this._view.webview);
        // this.address = chat.chat_id;
        if (!this._view) {
            return;
        }
        // this._view.webview.html = chat.get_html_for_chat(
        //     this._view.webview,
        //     this.context.extensionUri
        // );

        // Could throw?
        const html = await this.html_main_screen(this._view.webview, chat_thread);
        this._view.webview.html = html;
        // this.update_webview();
    }

    public async newChat()
    {
        const message = newChatAction();
        this._view?.webview.postMessage(message);
    }

    public async delete_old_settings()
    {
        await vscode.workspace.getConfiguration().update('refactai.apiKey', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration().update('refactai.addressURL', undefined, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration().update('codify.apiKey', undefined, vscode.ConfigurationTarget.Global);
        if(vscode.workspace.workspaceFolders) {
            await vscode.workspace.getConfiguration().update('refactai.apiKey', undefined, vscode.ConfigurationTarget.Workspace);
            await vscode.workspace.getConfiguration().update('refactai.addressURL', undefined, vscode.ConfigurationTarget.Workspace);
            await vscode.workspace.getConfiguration().update('codify.apiKey', undefined, vscode.ConfigurationTarget.Workspace);
        }
        
        await this.context.globalState.update('refactai.hostType', undefined);
    }

    public async js2ts_message(data: any)
    {
        if (!this._view) {
            return;
        }
        // console.log(`RECEIVED JS2TS: ${JSON.stringify(data)}`);
        switch (data.type) {
        // case EVENT_NAMES_FROM_CHAT.OPEN_IN_CHAT_IN_TAB:
        // case "open_chat_in_new_tab": {
        //     const chat_id = data?.chat_id || this.chat?.chat_id;
        //     // const chat_id = data.payload.id;
        //     if(!chat_id || typeof chat_id !== "string") {return; }
        //     if(!this.chatHistoryProvider) { return; }

        //     const openTab = global.open_chat_tabs?.find(tab => tab.chat_id === chat_id);
        //     if(openTab) {
        //         return openTab.focus();
        //     }
        //     // is extensionUri defined anywhere?
        //     await chatTab.ChatTab.open_chat_in_new_tab(this.chatHistoryProvider, chat_id, this.context.extensionUri.toString(), true);
        //     this.chat = null;
        //     return this.goto_main();
        // }

        // case "focus_back_to_editor": {
        //     vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        //     break;
        // }

        // case "delete_chat": {
        //     const chat_id = data.chat_id;
        //     await this.make_sure_have_chat_history_provider().delete_chat(chat_id);
        //     break;
        // }
        // case "button_hf_open_tokens": {
        //     vscode.env.openExternal(vscode.Uri.parse(`https://huggingface.co/settings/tokens`));
        //     break;
        // }
        // case "privacy": {
        //     vscode.commands.executeCommand("refactaicmd.privacySettings");
        //     break;
        // }
        case "openSettings": {
            vscode.commands.executeCommand("refactaicmd.openSettings");
            break;
        }
        // case "openKeys": {
        //     vscode.commands.executeCommand("workbench.action.openGlobalKeybindings", "Refact.ai");
        //     break;
        // }
        // case "restore_chat": {
        //     const chat_id = data.chat_id;
        //     if (!chat_id) {
        //         break;
        //     }
        //     let editor = vscode.window.activeTextEditor;

        //     const caps = await get_caps();

        //     let chat: OldChat | undefined = await this.make_sure_have_chat_history_provider().lookup_chat(chat_id);
        //     if (!chat) {
        //         console.log(`Chat ${chat_id} not found, cannot restore`);
        //         break;
        //     }

        //     const openTab = global.open_chat_tabs?.find(tab => tab.chat_id === chat_id);
        //     if(openTab) {
        //         return openTab.focus();
        //     } else {
        //         const model = caps.running_models.includes(chat.chatModel)
		// 			? chat.chatModel
		// 			: caps.code_chat_default_model;

        //         // await open_chat_tab(
        //         //     "",
        //         //     editor,
        //         //     true,
        //         //     model,
        //         //     chat.messages,
        //         //     chat_id,
        //         // );
        //     }
        //     break;
        // }
        // case EVENT_NAMES_FROM_CHAT.BACK_FROM_CHAT:
        // case EVENT_NAMES_FROM_STATISTIC.BACK_FROM_STATISTIC:
        // case FIM_EVENT_NAMES.BACK:
        // case "back-from-chat": {
        //     this.goto_main();
        //     this.chat = null;
        //     break;
        // }

        // case "fim_debug": {
        //     await open_fim_debug();
        //     break;
        // }
        }
    }

    private async handleEvents(e: unknown) {
        console.log("sidebar event", e);
        if(!e || typeof e !== "object") {
            return;
        }
        if(!("type" in e)) {
            return;
        }
        // FIM Data from IDE
        if(fim.ready.match(e)|| fim.request.match(e)) {
            if(global.fim_data_cache) {
                const event = fim.receive(global.fim_data_cache);
                this._view?.webview.postMessage(event);
            } else {
                const event = fim.error("No FIM data found, please make a completion");
                this._view?.webview.postMessage(event);
            }
        }

        if (isSetupHost(e)) {
            const { host } = e.payload;
            await this.context.globalState.update('refactai.hostType', host.type);
            
            if (host.type === "cloud") {
                await this.delete_old_settings();
                await vscode.workspace.getConfiguration().update('refactai.addressURL', "Refact", vscode.ConfigurationTarget.Global);
                await vscode.workspace.getConfiguration().update('refactai.apiKey', host.apiKey, vscode.ConfigurationTarget.Global);
            } else if (host.type === "self") {
                await this.delete_old_settings();
                await vscode.workspace.getConfiguration().update('refactai.addressURL', host.endpointAddress, vscode.ConfigurationTarget.Global);
                await vscode.workspace.getConfiguration().update('refactai.apiKey', 'any-will-work-for-local-server', vscode.ConfigurationTarget.Global);
            } else if (host.type === "enterprise") {
                await this.delete_old_settings();
                await vscode.workspace.getConfiguration().update('refactai.addressURL', host.endpointAddress, vscode.ConfigurationTarget.Global);
                await vscode.workspace.getConfiguration().update('refactai.apiKey', host.apiKey, vscode.ConfigurationTarget.Global);
            }
        }

        if (isLogOut(e)) {
            await this.delete_old_settings();
        }

        if (isOpenExternalUrl(e)) {
            await vscode.env.openExternal(vscode.Uri.parse(e.payload.url));
        }

        if(ideNewFileAction.match(e)) {
            const action = e as ReturnType<typeof ideNewFileAction>;
            return vscode.workspace.openTextDocument().then((document) => {
                vscode.window.showTextDocument(document, vscode.ViewColumn.Active)
                    .then((editor) => {
                        editor.edit((editBuilder) => {
                            editBuilder.insert(new vscode.Position(0, 0), action.payload);
                        });
                    });
            });
        }

        if(ideOpenHotKeys.match(e)) {
            return vscode.commands.executeCommand("workbench.action.openGlobalKeybindings", "refact.ai");
        }

        if(ideOpenSettingsAction.match(e)) {
            return vscode.commands.executeCommand("workbench.action.openSettings", "refactai");
        }

        if(ideOpenFile.match(e)) {
            return this.handleOpenFile(e.payload);
        }

        if(ideDiffPasteBackAction.match(e)) {
            this.tool_edit_in_progress = e.payload.chatId ? {chatId: e.payload.chatId, toolCallId: e.payload.toolCallId} : null;
            return this.handleDiffPasteBack(e.payload.content);
        }


        if(ideAnimateFileStart.match(e)) {
            return this.startFileAnimation(e.payload);
        }

        if(ideAnimateFileStop.match(e)) {
            return this.stopFileAnimation(e.payload);
        }

        if(ideChatPageChange.match(e)) {
            return this.handleCurrentChatPage(e.payload);
        }

        if(ideIsChatStreaming.match(e)) {
            return this.handleStreamingChange(e.payload);
        }
        if (ideSetCodeCompletionModel.match(e)) {
            return this.handleSetCodeCompletionModel(e.payload);
        }

        if (ideSetLoginMessage.match(e)) {
            return this.handleSetLoginMessage(e.payload);
        }

        if (ideSetActiveTeamsGroup.match(e)) {
            return this.handleSetActiveGroup(e.payload);
        }

        if (ideClearActiveTeamsGroup.match(e)) {
            return this.handleClearActiveGroup();
        }

        if(ideEscapeKeyPressed.match(e)) {
            return this.handleEscapePressed(e.payload);
        }

        if(ideToolCall.match(e)) {
            this.tool_edit_in_progress = {chatId: e.payload.chatId, toolCallId: e.payload.toolCall.id};
            return this.handleToolEdit(e.payload.toolCall, e.payload.edit);
        }
        // if(ideOpenChatInNewTab.match(e)) {
        //     return this.handleOpenInTab(e.payload);
        // }
    }

    // async handleOpenInTab(chat_thread: ChatThread) {
    //     if(!this._view) {
    //         // Can this._view be undefined?
    //         return;
    //     }

    //     const panel = vscode.window.createWebviewPanel(
    //         "refact-chat-tab",
    //         truncate(`Refact.ai ${chat_thread.title}`, 24),
    //         vscode.ViewColumn.One,
    //         {
    //             enableScripts: true,
    //             retainContextWhenHidden: true,
    //         }
    //     );

    //     // make the global tabs an object with chat id as the key.
    //     const html = await this.html_main_screen(this._view.webview, chat_thread, true);
    //     global.open_chat_panels[chat_thread.id] = panel;
    //     panel.onDidDispose(() => {
    //         delete global.open_chat_panels[chat_thread.id];
    //     });
    //     this.goto_main();
    //     panel.webview.html = html;

    // }

    async handleToolEdit(toolCall: TextDocToolCall,  toolEdit: ToolEditResult) {
        if(!toolEdit.file_before && toolEdit.file_after) {
            return this.createNewFileWithContent(toolCall.function.arguments.path, toolEdit.file_after);
        }

        return this.addDiffToFile(toolCall.function.arguments.path, toolEdit.file_after);
    }


    // This isn't called
    async deleteFile(fileName: string) {
        const uri = this.filePathToUri(fileName);
        const edit = new vscode.WorkspaceEdit();
        edit.deleteFile(uri);
        return vscode.workspace.applyEdit(edit).then(success => {
            if(!success) {
                vscode.window.showInformationMessage("Error: could not delete: "  + uri);
            }
        });
    }

    createNewFileWithContent(fileName: string, content: string) {
        const uri = this.filePathToUri(fileName);
        const newFile = vscode.Uri.parse('untitled:' + uri.fsPath);
        vscode.workspace.openTextDocument(newFile).then(document => {
            const edit = new vscode.WorkspaceEdit();
            edit.insert(newFile, new vscode.Position(0, 0), content);
            return vscode.workspace.applyEdit(edit).then(success => {
                if (success) {
                    this.watchFileForSaveOrClose(document);
                    vscode.window.showTextDocument(document);
                    // TOOD: send message to ide when file is saved, or closed
                } else {
                    vscode.window.showInformationMessage('Error: creating file ' + fileName);
                }
            });
        });
    }

    watchFileForSaveOrClose(document: vscode.TextDocument) {
        const disposables: vscode.Disposable[] = [];
        const saveDisposable = vscode.workspace.onDidSaveTextDocument((savedDoc) => {
            if (savedDoc.uri.toString() === document.uri.toString()) {
                // Send message to webview that file was saved
                this.toolEditChange(document.uri.fsPath, true);
                disposables.forEach(d => d.dispose());
            }
        });
        disposables.push(saveDisposable);

        const closeDisposable = vscode.workspace.onDidCloseTextDocument((closedDoc) => {
            if (closedDoc.uri.toString() === document.uri.toString()) {
                // Send message to webview that file was closed
                this.toolEditChange(document.uri.fsPath, false);
                disposables.forEach(d => d.dispose());
            }
        });
        disposables.push(closeDisposable);

        this._disposables.push(...disposables);
    }

    toolEditChange(path: string, accepted: boolean | "indeterminate") {
        if(this.tool_edit_in_progress) {
            const action = ideToolCallResponse({
                chatId: this.tool_edit_in_progress.chatId,
                toolCallId: this.tool_edit_in_progress.toolCallId ?? "",
                accepted
            });
            this._view?.webview.postMessage(action);
            this.tool_edit_in_progress = null;
        }
    }

    async addDiffToFile(fileName: string, content: string) {
        const uri = this.filePathToUri(fileName);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);

        const start = new vscode.Position(0, 0);
        const end = new vscode.Position(document.lineCount, 0);
        const range = new vscode.Range(start, end);


        return diff_paste_back(
            document,
            range,
            content
        );
    }

    // this isn't called
    async editFileWithContent(fileName: string, content: string) {
        const uri = this.filePathToUri(fileName);
        const document = await vscode.workspace.openTextDocument(uri);

        const start = new vscode.Position(0, 0);
        const end = new vscode.Position(document.lineCount, 0);
        const range = new vscode.Range(start, end);

        const edit = new vscode.WorkspaceEdit();
        edit.delete(document.uri, range);
        edit.insert(document.uri, start, content);
        vscode.workspace.applyEdit(edit).then(success => {
            if(success) {
                vscode.window.showTextDocument(document);
            } else {
                vscode.window.showInformationMessage('Error: editing file ' + fileName);
            }
        });
    }



    async handleCurrentChatPage(page: string) {
        this.context.globalState.update("chat_page", JSON.stringify(page));
        vscode.commands.executeCommand("setContext", "refactai.chat_page", page);
    }

    async handleStreamingChange(state: boolean) {
        global.is_chat_streaming = state;
    }

    async handleSetCodeCompletionModel(model: string) {
        await vscode.workspace.getConfiguration().update("refactai.codeCompletionModel", model, vscode.ConfigurationTarget.Global);
    }

    handleSetLoginMessage(message: string) {
        usabilityHints.show_message_from_server('InferenceServer', message);
    }

    async handleSetActiveGroup (group:TeamsGroup) {
        await vscode.workspace.getConfiguration().update(
            'refactai.activeGroup',
            group,
            vscode.ConfigurationTarget.Workspace
        );
        console.log(`[DEBUG]: updated locally active group in ./.vscode/settings.json: `, group);
        this.handleSettingsChange();
    }

    async handleClearActiveGroup () {
        await vscode.workspace.getConfiguration().update(
            'refactai.activeGroup',
            undefined,
            vscode.ConfigurationTarget.Workspace
        );
        this.handleSettingsChange();
    }

    async handleEscapePressed(mode: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }
        // more logic could be developed for different scenarios when esc was pressed
        if (mode === "combobox") {
            await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        }
    }

    private getWorkspaceFolderForFile(filePath?: string): vscode.WorkspaceFolder | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }

        if (filePath) {
            const folder = workspaceFolders.find(folder => {
                const folderPath = folder.uri.fsPath;
                return filePath.startsWith(folderPath);
            });

            if (folder) {
                return folder;
            }
        }

        return workspaceFolders[0];
    }

    private filePathToUri(fileName: string): vscode.Uri {
        let formattedFileName = fileName;
    
        // Handle Windows extended-length paths robustly
        // Examples:
        //   \\?\C:\Users\TestUser\Desktop\test6.py  =>  C:\Users\TestUser\Desktop\test6.py
        //   \\?\UNC\server\share\file.txt           =>  \\server\share\file.txt
        if (typeof formattedFileName === 'string') {
            if (formattedFileName.startsWith('\\\\?\\UNC\\')) {
                // UNC path: replace \\?\UNC\ with \\
                formattedFileName = '\\\\' + formattedFileName.slice(8);
            } else if (formattedFileName.startsWith('\\\\?\\')) {
                // Local drive path: remove \\?\
                formattedFileName = formattedFileName.slice(4);
            }
        }

        
        if (path.isAbsolute(formattedFileName)) {
            return vscode.Uri.file(formattedFileName);
        }
        
        const activeEditor = vscode.window.activeTextEditor;
        const currentActiveEditorPath = activeEditor?.document.uri.fsPath;

        // Getting current workspace folder based on active editor's path
        const workspaceFolder = this.getWorkspaceFolderForFile(currentActiveEditorPath);
        if (workspaceFolder) {
            const workspaceRoot = workspaceFolder.uri.fsPath;
            const candidate = path.resolve(workspaceRoot, formattedFileName);
            return vscode.Uri.file(candidate);
        }
    
        // Fallback: just return as is (may not exist)
        return vscode.Uri.file(formattedFileName);
    }

    async startFileAnimation(fileName: string) {
        const editor = vscode.window.activeTextEditor;
        const uri = this.filePathToUri(fileName);
        if (!editor) { return; }

        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);

        const state = estate.state_of_editor(editor, "start_animate for file: " + uri);
        if(!state) {return;}

        await estate.switch_mode(state, estate.Mode.DiffWait);
        const startPosition = new vscode.Position(0, 0);
        if (!document) {return;}
        const endPosition = new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);

        state.showing_diff_for_range = new vscode.Range(startPosition, endPosition);
        animation_start(editor, state);
    }

    async stopFileAnimation(fileName: string) {
        const editor = vscode.window.activeTextEditor;
        const uri = this.filePathToUri(fileName);

        const state = estate.state_of_editor(editor, "stop_animate for file: " + uri);
        if(!state) {return;}

        await estate.switch_mode(state, estate.Mode.Normal);
    }


    private async handleDiffPasteBack(code_block: string) {
        const editor = vscode.window.activeTextEditor;
        if(!editor) { return; }
        const range = editor.selection;
        const startOfLine = new vscode.Position(range.start.line, 0);
        const endOfLine = new vscode.Position(range.start.line + 1, 0);
        const firstLineRange = new vscode.Range(startOfLine, endOfLine);

		return diff_paste_back(
            editor.document,
            firstLineRange,
             code_block
        );

	}


    async handleOpenFile(file: OpenFilePayload) {
        const uri = this.filePathToUri(file.file_path);
        const document = await vscode.workspace.openTextDocument(uri);

        if(file.line !== undefined) {
            const position = new vscode.Position(file.line ?? 0, 0);
            const editor = await vscode.window.showTextDocument(document);
            const range = new vscode.Range(position, position);
            editor.revealRange(range);
        } else {
            await vscode.window.showTextDocument(document);
        }

        return document;
    }

    getColorTheme(): "light" | "dark" {
        switch(vscode.window.activeColorTheme.kind) {
            case vscode.ColorThemeKind.Light: return "light";
            case vscode.ColorThemeKind.HighContrastLight: return "light";
            default: return "dark";
        }
    }

    sendCurrentProjectInfo() {
        const action = setCurrentProjectInfo({name: vscode.workspace.name ?? ""});
        this._view?.webview.postMessage(action);
    }


    async createInitialState(thread?: ChatThread, tabbed = false): Promise<Partial<InitialState>> {
        const fontSize = vscode.workspace.getConfiguration().get<number>("editor.fontSize") ?? 12;
        const scaling = fontSize < 14 ? "90%" : "100%";
        const activeColorTheme = this.getColorTheme();
        const vecdb = vscode.workspace.getConfiguration()?.get<boolean>("refactai.vecdb") ?? false;
        const ast = vscode.workspace.getConfiguration()?.get<boolean>("refactai.ast") ?? false;
        const apiKey = vscode.workspace.getConfiguration()?.get<string>("refactai.apiKey") ?? "";
        const addressURL = vscode.workspace.getConfiguration()?.get<string>("refactai.addressURL") ?? "";
        const activeTeamsGroup = vscode.workspace.getConfiguration()?.get<TeamsGroup>("refactai.activeGroup") ?? null;
        const port = global.rust_binary_blob?.get_port() ?? 8001;
        const completeManual = await getKeyBindingForChat("refactaicmd.completionManual");
        const shiftEnterToSubmit = vscode.workspace.getConfiguration()?.get<boolean>("refactai.shiftEnterToSubmit")?? false;

        const currentActiveWorkspaceName = this.getActiveWorkspace();

        const config: InitialState["config"] = {
            host: "vscode",
            tabbed,
            shiftEnterToSubmit,
            themeProps: {
                accentColor: "gray",
                scaling,
                hasBackground: false,
                appearance: activeColorTheme,
            },
            features: {
                vecdb,
                ast,
                images: true,
                statistics: true,
            },
            keyBindings: {
                completeManual,
            },
            apiKey,
            addressURL,
            lspPort: port,
            currentWorkspaceName: currentActiveWorkspaceName,
        };

        const state: Partial<InitialState> = {
            teams: {
                group: activeTeamsGroup,
            },
            current_project: {name: vscode.workspace.name ?? ""},
            config,
        };

        const file = this.getActiveFileInfo();
        const snippet = this.getSnippetFromEditor();

        if(snippet && file) {
            state.active_file = file;
            state.selected_snippet = snippet;
        }

        if(thread) {
            const chat: InitialState["chat"] = {
                streaming: false,
                error: null,
                prevent_send: true,
                waiting_for_response: false,
                tool_use: thread.tool_use ? thread.tool_use : "explore",
                cache: {},
                system_prompt: {},
                send_immediately: thread.messages.length > 0,
                thread,
            };
            state.chat = chat;
            state.pages = [{name: "login page"}, {name: "history"}, {name: "chat"}];
        }

        return state;
    }

    private async html_main_screen(webview: vscode.Webview, chat_thread?: ChatThread, tabbed?: boolean)
    {
        // TODO: add send immediately flag for context menu and toolbar
        const extensionUri = this.context.extensionUri;
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "node_modules", "refact-chat-js", "dist", "chat", "index.umd.cjs")
        );

        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "node_modules", "refact-chat-js", "dist", "chat", "style.css")
        );

        const styleOverride = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, "assets", "custom-theme.css")
        );

        const nonce = this.getNonce();
        let existing_address = vscode.workspace.getConfiguration().get("refactai.addressURL");
        if (typeof existing_address !== "string" || (typeof existing_address === "string" && !existing_address.match(/^https?:\/\//))) {
            existing_address = "";
        }

        const initialState = await this.createInitialState(chat_thread, tabbed);
        let stringifiedInitialState = JSON.stringify(initialState);
        stringifiedInitialState = stringifiedInitialState.replace(/\<\/script>/gi, "</scr\"+\"ipt>");



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
                } 'unsafe-inline'; img-src 'self' data: https: http://127.0.0.1:*; script-src 'nonce-${nonce}'; style-src-attr 'sha256-tQhKwS01F0Bsw/EwspVgMAqfidY8gpn/+DKLIxQ65hg=' 'unsafe-hashes';">
                <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1">

                <title>Refact.ai Chat</title>
                <link href="${styleMainUri}" rel="stylesheet">
                <link href="${styleOverride}" rel="stylesheet">
            </head>
            <body>
                <div id="refact-chat"></div>

                <script nonce="${nonce}">
                const initialState = ${stringifiedInitialState};
                window.__INITIAL_STATE__ = initialState;
                window.onload = function() {
                    const root = document.getElementById("refact-chat");
                    // TODO: config no longer needs to passed to the component like this.np
                    RefactChat.render(root, initialState.config);
                }
                </script>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    getNonce() {
        let text = "";
        const possible =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    dispose() {
        vscode.commands.executeCommand("setContext", "refactai.chat_page", "");
        this._disposables.forEach(d => d.dispose());
    }
}


export default PanelWebview;
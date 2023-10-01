/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import { v4 as uuidv4 } from "uuid";

export type Chat = {
    chatId: string; // Unique identifier for each chat
    chatName: string;
    questions: string[];
    answers: string[];
    time: Date; // Store the initial time of each chat
    chatModel: string;
    chatModelFunction: string;
};

export type ChatHistory = {
    [user: string]: Chat[];
};

export default class ChatHistoryProvider {
    private chatHistory: ChatHistory = {};
    private currentUser: string;

    constructor(
        private context: vscode.ExtensionContext | undefined,
        private user: string
    ) {
        // Initialize the chat history for the current user when the extension is activated
        // Load chat history from global state if available
        this.currentUser = user;
        this.loadChatHistoryFromGlobalState().then((history) => {
            if (history) {
               this.chatHistory = history;
            }
        });
    }

    public generateChatId(): string {
        return uuidv4();
    }

    public async getChatNamesSortedByTime(): Promise<
        { chatId: string; chatName: string; time: Date; lastQuestion: string }[]
    > {
        const userChatData = this.chatHistory[this.currentUser];
        if (!userChatData) {
            return [];
        }

        const chatNamesWithTime: {
            chatId: string;
            chatName: string;
            time: Date;
            lastQuestion: string;
        }[] = userChatData.map((chat) => ({
            chatId: chat.chatId,
            chatName: chat.chatName.length > 15 ? chat.chatName.substring(0, 15) + "..." : chat.chatName,
            time: chat.time,
            lastQuestion:
                chat.questions[chat.questions.length - 1] ?
                    chat.questions[chat.questions.length - 1].replace("'''", "").length > 15 ?
                        chat.questions[chat.questions.length - 1].replace("'''", "").substring(0, 15) + "..."
                    : chat.questions[chat.questions.length - 1].replace("'''", "")
                : "",
        }));

        chatNamesWithTime.sort((a, b) => {
            const aTime = a.time instanceof Date ? a.time.getTime() : 0;
            const bTime = b.time instanceof Date ? b.time.getTime() : 0;
            return bTime - aTime;
        });

        return chatNamesWithTime;
    }

    public async getChat(chatId: string): Promise<Chat | undefined> {
        const userChatData = this.chatHistory[this.currentUser];
        if (!userChatData) {
            return undefined;
        }
        return userChatData.find((chat) => chat.chatId === chatId);
    }

    public async addMessageToChat(
        chatId: string,
        question: string,
        answer: string,
        chatModel: string,
        chatModelFunction: string,
        chatName: string
    ) {
        let userChatData = this.chatHistory[this.currentUser];
        if (!userChatData) {
            userChatData = [];
        }

        const existingChat = userChatData.find((chat) => chat.chatId === chatId);

        if (!existingChat) {
            userChatData.push({
                chatId,
                chatName: chatName,
                questions: [],
                answers: [],
                time: new Date(),
                chatModel,
                chatModelFunction,
            });
        }

        const chatToUpdate = existingChat || userChatData[userChatData.length - 1];

        if (question !== "") {
            chatToUpdate.questions.push(question);
        } else if (answer !== "") {
            chatToUpdate.answers.push(answer);
        } else {
            console.log("nothing to add to chat!!");
            return false;
        }
        chatToUpdate.time = new Date();
        this.chatHistory[this.currentUser] = userChatData;
        await this.saveChatHistoryToGlobalState();
        return true;
    }

    public async deleteChatEntry(chatId: string): Promise<boolean> {
        let userChatData = this.chatHistory[this.currentUser];
        if (!userChatData) {
            return false;
        }

        const chatIndex = userChatData.findIndex((chat) => chat.chatId === chatId);
        if (chatIndex === -1) {
            return false;
        }

        userChatData.splice(chatIndex, 1);
        this.chatHistory[this.currentUser] = userChatData;

        await this.saveChatHistoryToGlobalState();

        return true;
    }

    public popLastMessageFromChat(
        chatId: string,
        popQ: boolean,
        popA: boolean
    ): boolean {
        const userChatData = this.chatHistory[this.currentUser];
        if (!userChatData) {
            return false;
        }

        const chatToUpdate = userChatData.find((chat) => chat.chatId === chatId);

        if (!chatToUpdate) {
            return false;
        }

        if (chatToUpdate.questions.length > 0 && popQ) {
            chatToUpdate.questions.pop();
        }

        if (chatToUpdate.answers.length > 0 && popA) {
            chatToUpdate.answers.pop();
        }

        chatToUpdate.time = new Date();
        this.chatHistory[this.currentUser] = userChatData;

        this.saveChatHistoryToGlobalState();

        return true;
    }

    private async saveChatHistoryToGlobalState() {
        await this.context?.globalState.update(
            "refact_chat_history",
            this.chatHistory
        );
    }

    private async loadChatHistoryFromGlobalState(): Promise<
        ChatHistory | undefined
    > {
        return this.context?.globalState.get<ChatHistory>("refact_chat_history");
    }
}

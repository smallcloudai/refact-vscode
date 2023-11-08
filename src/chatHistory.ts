/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import { v4 as uuidv4 } from "uuid";

export type Chat = {
    chat_id: string; // Unique identifier for each chat
    chat_title: string;
    messages: [string, string][]; // role, content
    time: Date;
    chatModel: string;
};

export type ChatHistory = {
    [user: string]: Chat[];
};

export default class ChatHistoryProvider {
    private chatHistory: ChatHistory = {};
    public currentUser: string;

    constructor(
        private context: vscode.ExtensionContext,
        private user: string
    ) {
        this.currentUser = user;
        this.chatHistory = this.loadChatHistoryFromGlobalState();
    }

    public chats_sorted_by_time():
        { chat_id: string; chat_title: string; time: Date; totalQuestions: number }[]
    {
        const userChatData = this.chatHistory[this.currentUser];
        if (!userChatData) {
            return [];
        }

        const chatNamesWithTime: {
            chat_id: string;
            chat_title: string;
            time: Date;
            totalQuestions: number;
        }[] = userChatData.map((chat) => ({
            chat_id: chat.chat_id,
            chat_title: chat.chat_title,
            time: chat.time,
            totalQuestions: chat.messages.length,
        }));

        chatNamesWithTime.sort((a, b) => {
            const aTime = a.time instanceof Date ? a.time.getTime() : 0;
            const bTime = b.time instanceof Date ? b.time.getTime() : 0;
            return bTime - aTime;
        });

        return chatNamesWithTime;
    }

    public async lookup_chat(chat_id: string): Promise<Chat | undefined> {
        const userChatData = this.chatHistory[this.currentUser];
        if (!userChatData) {
            return undefined;
        }
        return userChatData.find((chat) => chat.chat_id === chat_id);
    }

    public async save_messages_list(
        chat_id: string,
        messages: [string, string][],
        chatModel: string,
    ) {
        let userChatData = this.chatHistory[this.currentUser];
        if (!userChatData) {
            userChatData = [];
        }
        const existingChat = userChatData.find((chat) => chat.chat_id === chat_id);
        if (!existingChat) {
            let chat: Chat = {
                chat_id,
                chat_title: "",
                messages: messages,
                time: new Date(),
                chatModel,
            };
            chat.chat_title = this.title(chat);
            userChatData.push(chat);
            //     userChatData.push({
            //         chat_id,
            //     chat_title: this.title
            //     messages: messages,
            //     time: new Date(),
            //     chatModel,
            // });
        }
        // const chatToUpdate = existingChat || userChatData[userChatData.length - 1];
        // chatToUpdate.messages.push([role, content]);
        // chatToUpdate.time = new Date();
        this.chatHistory[this.currentUser] = userChatData;
        await this.saveChatHistoryToGlobalState();
        return true;
    }

    public title(chat: Chat): string
    {
        let first_question = "";
        for (let i = 0; i < chat.messages.length; i++) {
            if (chat.messages[i][0] === "user") {
                first_question = chat.messages[i][1];
                break;
            }
        }
        // find first 15 characters, non space, non newline, non special character
        let first_normal_char_index = first_question.search(/[^ \n\r\t`]/);
        let first_40_characters = first_question.substring(first_normal_char_index, first_normal_char_index + 40);
        let first_41_characters = first_question.substring(first_normal_char_index, first_normal_char_index + 41);
        if (first_40_characters !== first_41_characters) {
            first_40_characters += "…";
        }
        return first_40_characters;
    }

    public async deleteChatEntry(chat_id: string): Promise<boolean> {
        let userChatData = this.chatHistory[this.currentUser];
        if (!userChatData) {
            return false;
        }

        const chatIndex = userChatData.findIndex((chat) => chat.chat_id === chat_id);
        if (chatIndex === -1) {
            return false;
        }

        userChatData.splice(chatIndex, 1);
        this.chatHistory[this.currentUser] = userChatData;

        await this.saveChatHistoryToGlobalState();

        return true;
    }

    public assign_messages_backup(
        chat_id: string,
        messages: [string, string][]
    ): boolean {
        const userChatData = this.chatHistory[this.currentUser];
        if (!userChatData) {
            return false;
        }
        const chatToUpdate = userChatData.find((chat) => chat.chat_id === chat_id);
        if (!chatToUpdate) {
            console.log(`Chat with id ${chat_id} not found, cannot reset history`);
            return false;
        }
        chatToUpdate.messages = messages;
        chatToUpdate.time = new Date();
        this.chatHistory[this.currentUser] = userChatData;
        this.saveChatHistoryToGlobalState();
        return true;
    }

    private async saveChatHistoryToGlobalState()
    {
        let validated_dict: ChatHistory = {};
        for (const user in this.chatHistory) {
            if (typeof user !== "string") {
                continue;
            }
            if (this.chatHistory[user].length > 0) {
                validated_dict[user] = this.chatHistory[user];
            }
        }
        await this.context?.globalState.update(
            "refact_chat_history",
            validated_dict
        );
    }

    private loadChatHistoryFromGlobalState(): ChatHistory
    {
        let maybe_history = this.context.globalState.get<ChatHistory>("refact_chat_history");
        if (maybe_history) {
            let validated_dict: ChatHistory = {};
            for (const user in maybe_history) {
                if (typeof user !== "string") {
                    continue;
                }
                if (maybe_history[user].length > 0) {
                    let validated_chats = maybe_history[user].filter((chat) => {
                        return (
                            chat.chat_id &&
                            chat.chat_title &&
                            chat.messages &&
                            chat.time
                        );
                    });
                    validated_dict[user] = validated_chats;
                }
            }
            return validated_dict;
        }
        return {};
    }
}

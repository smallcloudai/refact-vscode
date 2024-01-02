/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";

const MAX_HISTORY_LENGTH = 150;


export type Chat = {
    chat_id: string; // Unique identifier for each chat
    chat_title: string;
    messages: [string, string][]; // role, content
    time: Date;
    chatModel: string;
};

export default class ChatHistoryProvider {
    private _history: Chat[];

    constructor(
        private context: vscode.ExtensionContext,
    ) {
        this._history = this.load_history_from_global_state();
    }

    public chats_sorted_by_time():
        { chat_id: string; chat_title: string; time: Date; totalQuestions: number }[]
    {
        const h = this._history;
        if (!h) {
            return [];
        }

        const h_with_question_n: {
            chat_id: string;
            chat_title: string;
            time: Date;
            totalQuestions: number;
        }[] = h.map((chat) => ({
            chat_id: chat.chat_id,
            chat_title: chat.chat_title,
            time: chat.time,
            totalQuestions: chat.messages.length,
        }));

        h_with_question_n.sort((a, b) => {
            const aTime = a.time instanceof Date ? a.time.getTime() : 0;
            const bTime = b.time instanceof Date ? b.time.getTime() : 0;
            return bTime - aTime;
        });

        return h_with_question_n;
    }

    public async lookup_chat(chat_id: string): Promise<Chat | undefined> {
        const h = this._history;
        if (!h) {
            return undefined;
        }
        return h.find((chat) => chat.chat_id === chat_id);
    }

    public async save_messages_list(
        chat_id: string,
        messages: [string, string][],
        chatModel: string,
    ) {
        let h = this._history;
        if (!h) {
            h = [];
        }
        const existingChat = h.find((chat) => chat.chat_id === chat_id);
        if (!existingChat) {
            let chat: Chat = {
                chat_id,
                chat_title: "",
                messages: messages,
                time: new Date(),
                chatModel,
            };
            chat.chat_title = this.title(chat);
            h.push(chat);
            if (h.length > MAX_HISTORY_LENGTH) {
                h = h.slice(h.length - MAX_HISTORY_LENGTH);
            }
        } else {
            existingChat.messages = messages;
            existingChat.chatModel = chatModel;
        }
        this._history = h;
        await this.save_history_to_global_state();
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
        let first_80_characters = first_question.substring(first_normal_char_index, first_normal_char_index + 80);
        let first_81_characters = first_question.substring(first_normal_char_index, first_normal_char_index + 81);
        if (first_80_characters !== first_81_characters) {
            first_80_characters += "…";
        }
        return first_80_characters;
    }

    public async delete_chat(chat_id: string): Promise<boolean> {
        let h = this._history;
        if (!h) {
            return false;
        }

        const chatIndex = h.findIndex((chat) => chat.chat_id === chat_id);
        if (chatIndex === -1) {
            return false;
        }

        h.splice(chatIndex, 1);
        this._history = h;

        await this.save_history_to_global_state();

        return true;
    }

    private async save_history_to_global_state()
    {
        await this.context?.globalState.update(
            "refact_chat_history",
            this._history,
        );
    }

    private load_history_from_global_state(): Chat[]
    {
        let maybe_history = this.context.globalState.get<Chat[]>("refact_chat_history");
        if (Array.isArray(maybe_history)) {
            return maybe_history;
        }
        return [];
    }
}

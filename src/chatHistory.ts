/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";

import {
    type ChatHistoryItem,
} from "refact-chat-js/dist/events";

const MAX_HISTORY_LENGTH = 150;

export type ChatRole =
  | "user"
  | "assistant"
  | "context_file"
  | "system"
  | "tool"
  | "context_memory"
  | "diff"
  | "plain_text";

export type ChatContextFile = {
  file_name: string;
  file_content: string;
  line1: number;
  line2: number;
  usefulness?: number;
};

export type ContextMemory = {
  memo_id: string;
  memo_text: string;
};

export type ToolCall = {
  function: {
    arguments: string; // stringed json
    name?: string; // will be present when it's new
  };
  index: number;
  type?: "function";
  id?: string;
};

export type ToolResult = {
  tool_call_id: string;
  finish_reason?: string; // "call_failed" | "call_worked";
  content: string;
};

interface BaseMessage
  extends Array<
    | string
    | ChatContextFile[]
    | ToolCall[]
    | ToolResult
    | undefined
    | null
    | ContextMemory[]
    | DiffChunk[]
  > {
  0: ChatRole;
  1:
    | null
    | string
    | ChatContextFile[]
    | ToolResult
    | ContextMemory[]
    | DiffChunk[];
}

export interface ChatContextFileMessage extends BaseMessage {
  0: "context_file";
  1: ChatContextFile[];
}

export interface UserMessage extends BaseMessage {
  0: "user";
  1: string;
}

export interface AssistantMessage extends BaseMessage {
  0: "assistant";
  1: string | null;
  2?: ToolCall[] | null;
}

export interface ToolCallMessage extends AssistantMessage {
  2: ToolCall[];
}

export interface SystemMessage extends BaseMessage {
  0: "system";
  1: string;
}

export interface ToolMessage extends BaseMessage {
  0: "tool";
  1: ToolResult;
}

export interface MemoryMessage extends BaseMessage {
  0: "context_memory";
  1: ContextMemory[];
}

// TODO: There maybe sub-types for this
export type DiffChunk = {
  file_name: string;
  file_action: string;
  line1: number;
  line2: number;
  lines_remove: string;
  lines_add: string;
  // apply?: boolean;
  // chunk_id?: number;
};
export interface DiffMessage extends BaseMessage {
  0: "diff";
  1: DiffChunk[];
  2: string; // tool_call_id
}

export function isUserMessage(message: ChatMessage): message is UserMessage {
  return message[0] === "user";
}

export interface PlainTextMessage extends BaseMessage {
  0: "plain_text";
  1: string;
}

 type ChatMessage =
  | UserMessage
  | AssistantMessage
  | ChatContextFileMessage
  | SystemMessage
  | ToolMessage
  | MemoryMessage
  | DiffMessage
  | PlainTextMessage;

export type OldChat = {
    chat_id: string; // Unique identifier for each chat
    chat_title: string;
    messages: ChatMessage[]; // role, content
    time: Date;
    chatModel: string;
};

export default class ChatHistoryProvider {
    private _history: OldChat[];

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

    public async lookup_chat(chat_id: string): Promise<OldChat | undefined> {
        const h = this._history;
        if (!h) {
            return undefined;
        }
        return h.find((chat) => chat.chat_id === chat_id);
    }

    public async save_messages_list(
        chat_id: string,
        messages: ChatMessage[],
        chatModel: string,
        title?: string
    ) {
        let h = this._history;
        if (!h) {
            h = [];
        }
        const existingChat = h.find((chat) => chat.chat_id === chat_id);
        if (!existingChat) {
            let chat: OldChat = {
                chat_id,
                chat_title: title || "",
                messages: messages,
                time: new Date(),
                chatModel,
            };
            if(!chat.chat_title) { chat.chat_title = this.title(chat); }
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

    public title(chat: OldChat): string
    {
        let first_question = "";
        for (let i = 0; i < chat.messages.length; i++) {
            const message = chat.messages[i];
            if (isUserMessage(message)) {
                first_question = message[0];
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

    private load_history_from_global_state(): OldChat[]
    {
        let maybe_history = this.context.globalState.get<OldChat[]>("refact_chat_history");
        if (Array.isArray(maybe_history)) {
            return maybe_history;
        }
        return [];
    }
}


export function convert_old_chat_to_new_chat(old_chat: OldChat): ChatHistoryItem {
    const { chat_id, chat_title, messages, time, chatModel } = old_chat;

    const msgs = messages.reduce<ChatHistoryItem["messages"]>((acc, message) => {
        if(message[0] === "assistant" ) {
            return [...acc, {role: message[0], content: message[1], tool_calls: message[2] }];
        }
        
        if(message[0] === "diff") {
            return [...acc, {role: message[0], content: message[1], tool_call_id: message[2]}];
        }

        if(message[0] === "user") {
            return [...acc, {role: message[0], content: message[1]}];
        }

        if(message[0] === "context_file") {
            return [...acc, {role: message[0], content: message[1]}];
        }

        if(message[0] === "context_memory") {
            return [...acc, {role: message[0], content: message[1]}];
        }

        if(message[0] === "plain_text") {
            return [...acc, {role: message[0], content: message[1]}];
        }

        if(message[0] === "system") {
            return [...acc, {role: message[0], content: message[1]}];
        }

        if(message[0] === "tool") {
            return [...acc, {role: message[0], content: message[1]}];
        }

        return acc;
    }, []);

    const date = new Date(time).toISOString();

    return {
        id: chat_id,
        model: chatModel,
        title: chat_title,
        messages: msgs,
        createdAt: date,
        updatedAt: date,
    };
}

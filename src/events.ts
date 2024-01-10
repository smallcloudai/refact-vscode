// import {
//   ChatMessages,
//   ChatResponse,
//   CapsResponse,
//   ChatContextFile,
// } from "../services/refact";

// TODO: have this exported?
export type ChatRole = "user" | "assistant" | "context_file";

export type ChatContextFile = {
  file_name: string;
  file_content: string;
  line1?: number;
  line2?: number;
};

interface BaseMessage extends Array<string | ChatContextFile[]> {
  0: ChatRole;
  1: string | ChatContextFile[];
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
  1: string;
}

export type ChatMessage =
  | UserMessage
  | AssistantMessage
  | ChatContextFileMessage;

export type ChatMessages = ChatMessage[];

interface BaseDelta {
  role: ChatRole;
}

interface AssistantDelta extends BaseDelta {
  role: "assistant";
  content: string;
}
interface ChatContextFileDelta extends BaseDelta {
  role: "context_file";
  content: ChatContextFile[];
}

type Delta = AssistantDelta | ChatContextFileDelta;

export type ChatChoice = {
  delta: Delta;
  finish_reason: "stop" | "abort" | null;
  index: number;
};

export type ChatResponse = {
  choices: ChatChoice[];
  created: number;
  model: string;
  id: string;
};


export type CapsResponse = {
  caps_version: number;
  cloud_name: string;
  code_chat_default_model: string;
  code_chat_models: Record<string, {}>;
  code_completion_default_model: string;
  code_completion_models: Record<string, {}>;
  code_completion_n_ctx: number;
  endpoint_chat_passthrough: string;
  endpoint_style: string;
  endpoint_template: string;
  running_models: string[];
  telemetry_basic_dest: string;
  telemetry_corrected_snippets_dest: string;
  tokenizer_path_template: string;
  tokenizer_rewrite_path: Record<string, unknown>;
};

export enum EVENT_NAMES_FROM_CHAT {
  SAVE_CHAT = "save_chat_to_history",
  ASK_QUESTION = "chat_question",
  REQUEST_CAPS = "chat_request_caps",
  STOP_STREAMING = "chat_stop_streaming",
  REQUEST_FILES = "chat_request_for_file",
}
export enum EVENT_NAMES_TO_CHAT {
  CLEAR_ERROR = "chat_clear_error",
  RESTORE_CHAT = "restore_chat_from_history",
  CHAT_RESPONSE = "chat_response",
  BACKUP_MESSAGES = "back_up_messages",
  DONE_STREAMING = "chat_done_streaming",
  ERROR_STREAMING = "chat_error_streaming",
  NEW_CHAT = "create_new_chat",
  RECEIVE_CAPS = "receive_caps",
  RECEIVE_CAPS_ERROR = "receive_caps_error",
  SET_CHAT_MODEL = "chat_set_chat_model",
  SET_DISABLE_CHAT = "set_disable_chat",
  RECEIVE_FILES = "receive_context_file",
  REMOVE_FILES = "remove_context_file",
}
export type ChatThread = {
  id: string;
  messages: ChatMessages;
  title?: string;
  model: string;
};
interface BaseAction {
  type: EVENT_NAMES_FROM_CHAT | EVENT_NAMES_TO_CHAT;
  payload?: {
    id: string;
    [key: string]: unknown;
  };
}
export interface ActionFromChat extends BaseAction {
  type: EVENT_NAMES_FROM_CHAT;
}
export declare function isActionFromChat(
  action: unknown
): action is ActionFromChat;
export interface RequestForFileFromChat extends ActionFromChat {
  type: EVENT_NAMES_FROM_CHAT.REQUEST_FILES;
  payload: {
    id: string;
  };
}
export declare function isRequestForFileFromChat(
  action: unknown
): action is RequestForFileFromChat;
export interface QuestionFromChat extends ActionFromChat {
  type: EVENT_NAMES_FROM_CHAT.ASK_QUESTION;
  payload: ChatThread;
}
export declare function isQuestionFromChat(
  action: unknown
): action is QuestionFromChat;
export interface SaveChatFromChat extends ActionFromChat {
  type: EVENT_NAMES_FROM_CHAT.SAVE_CHAT;
  payload: ChatThread;
}
export declare function isSaveChatFromChat(
  action: unknown
): action is SaveChatFromChat;
export interface RequestCapsFromChat extends ActionFromChat {
  type: EVENT_NAMES_FROM_CHAT.REQUEST_CAPS;
  payload: {
    id: string;
  };
}
export declare function isRequestCapsFromChat(
  action: unknown
): action is RequestCapsFromChat;
export interface StopStreamingFromChat extends ActionFromChat {
  type: EVENT_NAMES_FROM_CHAT.STOP_STREAMING;
  payload: {
    id: string;
  };
}
export declare function isStopStreamingFromChat(
  action: unknown
): action is StopStreamingFromChat;
export interface ActionToChat extends BaseAction {
  type: EVENT_NAMES_TO_CHAT;
}
export declare function isActionToChat(action: unknown): action is ActionToChat;
export interface ReceiveContextFile extends ActionToChat {
  type: EVENT_NAMES_TO_CHAT.RECEIVE_FILES;
  payload: {
    id: string;
    files: ChatContextFile[];
  };
}
export declare function isReceiveContextFile(
  action: unknown
): action is ReceiveContextFile;
export interface RemoveContextFile extends ActionToChat {
  type: EVENT_NAMES_TO_CHAT.REMOVE_FILES;
  payload: {
    id: string;
  };
}
export declare function isRemoveContext(
  action: unknown
): action is RemoveContextFile;
export interface SetChatDisable extends ActionToChat {
  type: EVENT_NAMES_TO_CHAT.SET_DISABLE_CHAT;
  payload: {
    id: string;
    disable: boolean;
  };
}
export declare function isSetDisableChat(
  action: unknown
): action is SetChatDisable;
export interface SetChatModel extends ActionToChat {
  type: EVENT_NAMES_TO_CHAT.SET_CHAT_MODEL;
  payload: {
    id: string;
    model: string;
  };
}
export declare function isSetChatModel(action: unknown): action is SetChatModel;
export interface ResponseToChat extends ActionToChat {
  type: EVENT_NAMES_TO_CHAT.CHAT_RESPONSE;
  payload: ChatResponse;
}
export declare function isResponseToChat(
  action: unknown
): action is ResponseToChat;
export interface BackUpMessages extends ActionToChat {
  type: EVENT_NAMES_TO_CHAT.BACKUP_MESSAGES;
  payload: {
    id: string;
    messages: ChatMessages;
  };
}
export declare function isBackupMessages(
  action: unknown
): action is BackUpMessages;
export interface RestoreChat extends ActionToChat {
  type: EVENT_NAMES_TO_CHAT.RESTORE_CHAT;
  payload: ChatThread;
}
export declare function isRestoreChat(action: unknown): action is RestoreChat;
export interface CreateNewChatThread extends ActionToChat {
  type: EVENT_NAMES_TO_CHAT.NEW_CHAT;
}
export declare function isCreateNewChat(
  action: unknown
): action is CreateNewChatThread;
export interface ChatDoneStreaming extends ActionToChat {
  type: EVENT_NAMES_TO_CHAT.DONE_STREAMING;
}
export declare function isChatDoneStreaming(
  action: unknown
): action is ChatDoneStreaming;
export interface ChatErrorStreaming extends ActionToChat {
  type: EVENT_NAMES_TO_CHAT.ERROR_STREAMING;
  payload: {
    id: string;
    message: string;
  };
}
export declare function isChatErrorStreaming(
  action: unknown
): action is ChatErrorStreaming;
export interface ChatClearError extends ActionToChat {
  type: EVENT_NAMES_TO_CHAT.CLEAR_ERROR;
}
export declare function isChatClearError(
  action: unknown
): action is ChatClearError;
export interface ChatReceiveCaps extends ActionToChat {
  type: EVENT_NAMES_TO_CHAT.RECEIVE_CAPS;
  payload: {
    id: string;
    caps: CapsResponse;
  };
}
export declare function isChatReceiveCaps(
  action: unknown
): action is ChatReceiveCaps;
export interface ChatReceiveCapsError extends ActionToChat {
  type: EVENT_NAMES_TO_CHAT.RECEIVE_CAPS_ERROR;
  payload: {
    id: string;
    message: string;
  };
}
export declare function isChatReceiveCapsError(
  action: unknown
): action is ChatReceiveCapsError;
export type Actions = ActionToChat | ActionFromChat;
export declare function isAction(action: unknown): action is Actions;
export {};

// TODO build a lib and export this

export enum EVENT_NAMES_FROM_CHAT {
  SAVE_CHAT = "save_chat_to_history",
  ASK_QUESTION = "chat_question",
  REQUEST_CAPS = "chat_request_caps",
  STOP_STREAMING = "chat_stop_streaming",
  REQUEST_FILES = "chat_request_for_file",
  BACK_FROM_CHAT = "chat_back_from_chat",
  OPEN_IN_CHAT_IN_TAB = "open_chat_in_new_tab",
  SEND_TO_SIDE_BAR = "chat_send_to_sidebar",
  READY = "chat_ready",
  NEW_FILE = "chat_create_new_file",
  PASTE_DIFF = "chat_paste_diff",
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
  ACTIVE_FILE_INFO = "chat_active_file_info",
  TOGGLE_ACTIVE_FILE = "chat_toggle_active_file",
}

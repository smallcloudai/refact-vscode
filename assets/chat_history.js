/* eslint-disable @typescript-eslint/naming-convention */
function chat_history_script(vscode) {
    // const backButton = document.querySelector("#back_button");
    const chatHistoryList = document.querySelector(".chat-history-list");

    // backButton.addEventListener('click', () => {
    //     vscode.postMessage({ type: "close_chat_history" });
    // });

    function print_date_time() {
        const now = new Date();
        const date = now.toLocaleDateString();
        const time = now.toLocaleTimeString();
        return `${date} ${time}`;
    }

    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.command) {
            case "loadHistory":
                // Clear the chat history list
                chatHistoryList.innerHTML = "";
                const chatHistory = message.history || [];
                //console.log(chatHistory);

                chatHistory.forEach((chat) => {
                    console.log(chat);
                    const chatItem = document.createElement("div");
                    chatItem.classList.add("chat-history-item");
                    chatItem.dataset.chatId = chat.chatId;

                    const deleteButton = document.createElement("button");
                    deleteButton.classList.add("delete-button");
                    deleteButton.textContent = "×";

                    deleteButton.addEventListener("click", (event) => {
                        event.stopPropagation();
                        event.preventDefault();

                        vscode.postMessage({ type: "delete_chat", chatId: chat.chatId });
                        chatItem.remove();
                    });

                    const chatName = document.createElement("div");
                    chatName.classList.add("chat-name");
                    chatName.textContent = chat.chatName;

                    const timestamp = document.createElement('div');
                    timestamp.classList.add('chat-timestamp');
                    timestamp.innerText = print_date_time();
                    
                    const lastQuestion = document.createElement("div");
                    lastQuestion.classList.add("last-question");
                    lastQuestion.textContent = 'Questions: '  + chat.totalQuestions;
                    
                    chatItem.appendChild(deleteButton);
                    chatItem.appendChild(chatName);
                    chatItem.appendChild(timestamp);
                    chatItem.appendChild(lastQuestion);


                    chatItem.addEventListener("click", () => {
                        vscode.postMessage({ type: "open_old_chat", chatId: chat.chatId });
                    });

                    chatHistoryList.appendChild(chatItem);
                });
                break;
        }
    });
}

/* eslint-disable @typescript-eslint/naming-convention */
function chat_history_script(vscode) {
    // const backButton = document.querySelector("#back_button");
    const chatHistoryList = document.querySelector(".chat-history-list");

    // backButton.addEventListener('click', () => {
    //     vscode.postMessage({ type: "close_chat_history" });
    // });

    function print_date_time(chat_time) {
        const dt = new Date(chat_time);
        const date = dt.toLocaleDateString();
        const time = dt.toLocaleTimeString();
        return `${date} ${time}`;
    }

    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.command) {
            case "loadHistory":
                // Clear the chat history list
                chatHistoryList.innerHTML = "";
                const chatHistory = message.history || [];
                console.log(chatHistory);
                if(chatHistory.length > 0) {
                    document.querySelector('.chat-history').style.display = 'flex';
                }

                chatHistory.forEach((chat) => {
                    // console.log(chat);
                    const chatItem = document.createElement("div");
                    chatItem.classList.add("chat-history-item");
                    chatItem.dataset.chat_id = chat.chat_id;

                    const deleteButton = document.createElement("button");
                    deleteButton.classList.add("delete-button");
                    deleteButton.textContent = "×";

                    // deleteButton.addEventListener("click", (event) => {
                    //     event.stopPropagation();
                    //     event.preventDefault();

                    //     vscode.postMessage({ type: "delete_chat", chat_id: chat.chat_id });
                    //     chatItem.remove();
                    // });

                    const chat_title = document.createElement("div");
                    chat_title.classList.add("chat-name");
                    chat_title.textContent = chat.chat_title;

                    const chatInfo = document.createElement("div");
                    chatInfo.classList.add('chat-info');

                    const timestamp = document.createElement('div');
                    timestamp.classList.add('chat-timestamp');
                    timestamp.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" class="bi bi-clock-fill" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/></svg>${print_date_time(chat.time)}`;

                    const lastQuestion = document.createElement("div");
                    lastQuestion.classList.add("last-question");
                    lastQuestion.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" class="bi bi-chat-fill" viewBox="0 0 16 16"><path d="M8 15c4.418 0 8-3.134 8-7s-3.582-7-8-7-8 3.134-8 7c0 1.76.743 3.37 1.97 4.6-.097 1.016-.417 2.13-.771 2.966-.079.186.074.394.273.362 2.256-.37 3.597-.938 4.18-1.234A9.06 9.06 0 0 0 8 15z"/></svg>${chat.totalQuestions}`;

                    chatItem.appendChild(deleteButton);
                    chatItem.appendChild(chat_title);
                    chatInfo.appendChild(timestamp);
                    chatInfo.appendChild(lastQuestion);
                    chatItem.appendChild(chatInfo);


                    chatItem.addEventListener("click", (evt) => {
                        evt.preventDefault();
                        if(evt.target.classList.contains('delete-button')) {
                            vscode.postMessage({ type: "delete_chat", chat_id: chat.chat_id });
                            chatItem.remove();
                        } else {
                            vscode.postMessage({ type: "restore_chat", chat_id: chat.chat_id });
                        }
                    });

                    chatHistoryList.appendChild(chatItem);
                });
                break;
        }
    });
}

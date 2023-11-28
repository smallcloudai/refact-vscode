/* eslint-disable @typescript-eslint/naming-convention */
function chat_history_script(vscode) {
    const chatHistoryList = document.querySelector(".chat-history-list");
    // const backButton = document.querySelector("#back_button");

    // backButton.addEventListener('click', () => {
    //     vscode.postMessage({ type: "close_chat_history" });
    // });

    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.command) {
            case "loadHistory":
                // Clear the chat history list
                chatHistoryList.innerHTML = "";
                const chatHistory = message.history || [];
                if(chatHistory.length > 0) {
                    document.querySelector('.chat-history').style.display = 'flex';
                }


                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const this_week = new Date();
                this_week.setDate(this_week.getDate() - this_week.getDay());
                this_week.setHours(0, 0, 0, 0);

                const grouped_chat = {
                    today: [],
                    this_week: [],
                    later: [],
                };

                chatHistory.forEach((chat) => {
                    const current_chat_date = new Date(chat.time);
                    if (current_chat_date >= today) {
                        grouped_chat.today.push(chat);
                    } else if (current_chat_date >= this_week) {
                        grouped_chat.this_week.push(chat);
                    } else {
                        grouped_chat.later.push(chat);
                    }
                });

                if(grouped_chat.today.length > 0) {
                    const today_heading = document.createElement('h4');
                    today_heading.classList.add('chat-history-today');
                    today_heading.innerHTML = `Today`;
                    chatHistoryList.appendChild(today_heading);
                    grouped_chat.today.forEach((chat) => {
                        render_history_item(chat);
                    });
                }

                if(grouped_chat.this_week.length > 0) {
                    const today_heading = document.createElement('h4');
                    today_heading.classList.add('chat-history-week');
                    today_heading.innerHTML = `This week`;
                    chatHistoryList.appendChild(today_heading);
                    grouped_chat.this_week.forEach((chat) => {
                        render_history_item(chat);
                    });
                }

                if(grouped_chat.later.length > 0) {
                    const today_heading = document.createElement('h4');
                    today_heading.classList.add('chat-history-later');
                    today_heading.innerHTML = `More than week`;
                    chatHistoryList.appendChild(today_heading);
                    grouped_chat.later.forEach((chat) => {
                        render_history_item(chat);
                    });
                }

                break;
        }
    });
    function render_history_item(chat) {
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
    }

    function print_date_time(chat_time) {
        const dt = new Date(chat_time);
        const date = dt.toLocaleDateString();
        const time = dt.toLocaleTimeString();
        return `${date} ${time}`;
    }
}

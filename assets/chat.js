/* eslint-disable @typescript-eslint/naming-convention */
(function () {
    const vscode = acquireVsCodeApi();
    const chat_input = document.querySelector('#chat-input');
    const chat_send_button = document.querySelector('#chat-send');
    const chat_content = document.querySelector('.codify-chat__content');

    chat_input.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });

    chat_send_button.addEventListener('click', () => {
        const message = chat_input.value;
        chat_input.value = '';
        vscode.postMessage({ type: "question-posted-within-tab", value: message});
    });

    chat_input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.shiftKey === false) {
            event.preventDefault();
            chat_send_button.click();
            return true;
        }
    });

    var last_answer_div = null;

    function chat_render(data)
    {
        if (Object.keys(data).length === 0) { return; };
        const message_pair_div = document.createElement('div');
        message_pair_div.classList.add('codify-chat__item');

        if (data.question) {
            const question_div = document.createElement('div');
            question_div.classList.add('codify-chat__question');
            question_div.innerHTML = data.question;
            message_pair_div.appendChild(question_div);
            last_answer_div = null;
        }

        if (!last_answer_div && data.answer) {
            const answer_div = document.createElement('div');
            answer_div.classList.add('codify-chat__answer');
            message_pair_div.appendChild(answer_div);
            last_answer_div = answer_div;
        }

        if (last_answer_div && data.answer) {
            last_answer_div.innerHTML = data.answer;
        }
        if(message_pair_div.children.length > 0) {
            chat_content.appendChild(message_pair_div);    
        }
    }

    function chat_add_buttons() {
        const chats = document.querySelectorAll('.codify-chat__item');
        if (chats.length === 0) { return; };
        const last = chats[chats.length - 1];
        const last_content = last.querySelector('.codify-chat__answer');
        if (!last_content) { return; };
        const snippets = last_content.querySelectorAll('pre code');
        snippets.forEach(snippet => {
            const original_content = snippet.innerHTML;
            const copy_button = document.createElement('button');
            const new_file_button = document.createElement('button');
            copy_button.classList.add('codify-chat__copybutton');
            copy_button.innerText = 'Copy';
            new_file_button.innerText = 'New File';
            new_file_button.classList.add('codify-chat__newbutton');
            copy_button.addEventListener('click', () => {
                copy_to_clipboard(original_content);
            });
            new_file_button.addEventListener('click', () => {
                vscode.postMessage({ type: "open-new-file", value: original_content});
            });
            snippet.appendChild(copy_button);
            snippet.appendChild(new_file_button);
        });
    }

    function copy_to_clipboard(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }

    window.addEventListener("message", (event) => {
		const message = event.data;
		switch (message.command) {
        case "chat-end-streaming":
            chat_add_buttons();
            break;
        case "chat-post-question":
            chat_render(message.value);
            break;
        case "chat-post-answer":
            chat_render(message.value);
            break;
        }
    });

})();

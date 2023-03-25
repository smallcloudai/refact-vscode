/* eslint-disable @typescript-eslint/naming-convention */
(function () {
    const vscode = acquireVsCodeApi();
    const chat_input = document.querySelector('#chat-input');
    const chat_send_button = document.querySelector('#chat-send');
    const chat_content = document.querySelector('.refactcss-chat__content');
    const stop_button = document.querySelector('#chat-stop');

    chat_input.focus();

    function input_care()
    {
        chat_input.style.height = 'auto';
        chat_input.style.height = chat_input.scrollHeight + 'px';
        const message = chat_input.value;
        let bad = message.trim() === '' || message.length >= 4000;
        chat_send_button.disabled = bad;
        chat_send_button.style.opacity = bad ? 0.5 : 1;
    }

    chat_input.addEventListener('input', function () {
        input_care();
    });

    chat_send_button.addEventListener('click', () => {
        const message = chat_input.value;
        chat_input.value = '';
        vscode.postMessage({ type: "question-posted-within-tab", value: message});
    });

    stop_button.addEventListener('click', () => {
        vscode.postMessage({ type: "stop-clicked" });
        visibility_control(true);
    });

    chat_input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.shiftKey === false) {
            event.preventDefault();
            chat_send_button.click();
            return true;
        }
        auto_scroll();
    });

    var last_answer_div = null;

    function chat_render(data)
    {
        if (Object.keys(data).length === 0) { return; };
        const message_pair_div = document.createElement('div');
        message_pair_div.classList.add('refactcss-chat__item');

        if (data.question) {
            const question_div = document.createElement('div');
            question_div.classList.add('refactcss-chat__question');
            question_div.innerHTML = data.question;
            message_pair_div.appendChild(question_div);
            last_answer_div = null;
        }

        if (!last_answer_div && data.answer) {
            const answer_div = document.createElement('div');
            answer_div.classList.add('refactcss-chat__answer');
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

    function chat_add_code_buttons() {
        const chats = document.querySelectorAll('.refactcss-chat__item');
        if (chats.length === 0) { return; };
        const last = chats[chats.length - 1];
        const last_content = last.querySelector('.refactcss-chat__answer');
        if (!last_content) { return; };
        const snippets = last_content.querySelectorAll('pre code');
        snippets.forEach(snippet => {
            const original_content = snippet.innerHTML;
            const copy_button = document.createElement('button');
            const new_file_button = document.createElement('button');
            copy_button.classList.add('refactcss-chat__copybutton');
            copy_button.innerText = 'Copy';
            new_file_button.innerText = 'New File';
            new_file_button.classList.add('refactcss-chat__newbutton');
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

    let currentHeight = document.documentElement.scrollHeight;
    function auto_scroll() {
        input_care();
        let newHeight = document.documentElement.scrollHeight;
        if (newHeight !== currentHeight) {
            window.scrollTo(0, newHeight);
            currentHeight = newHeight;
        }
    }

    window.addEventListener("message", (event) => {
		const message = event.data;
        let input_should_be_visible = false;
		switch (message.command) {
        case "chat-end-streaming":
            input_should_be_visible = true;
            chat_add_code_buttons();
            break;
        case "chat-error-streaming":
            input_should_be_visible = true;
            chat_input.value = message.backup_user_phrase;
            break;
        case "chat-post-question":
            chat_render(message.value);
            break;
        case "chat-post-answer":  // streaming also goes there, with partial answers
            chat_render(message.value);
            break;
        case "chat-set-question-text":
            input_should_be_visible = true;
            chat_input.value = message.value.question;
            setTimeout(() => {
                input_care();
            }, 100);
            input_care();
            break;
        case "nop":
            break;
        }
        visibility_control(input_should_be_visible);
    });

    function visibility_control(input_should_be_visible) {
        if (input_should_be_visible) {
            stop_button.style.display = 'none';
            chat_input.style.display = 'block';
            chat_send_button.style.display = 'block';
        } else {
            stop_button.style.display = 'flex';
            chat_input.style.display = 'none';
            chat_send_button.style.display = 'none';
        }
        auto_scroll();
    }
})();

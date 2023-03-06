/* eslint-disable @typescript-eslint/naming-convention */
(function () {
    const vscode = acquireVsCodeApi();
    const chat_input = document.querySelector('#chat-input');
    const chat_send_button = document.querySelector('#chat-send');
    const chat_content = document.querySelector('.codify-chat__content');

    chat_send_button.addEventListener('click', () => {
        const message = chat_input.value;
        vscode.postMessage({ type: "question-posted-within-tab", value: message});
    });

    var last_answer_div = null;

    function chat_render(data)
    {
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

        chat_content.appendChild(message_pair_div);
    }

    window.addEventListener("message", (event) => {
		const message = event.data;
		switch (message.command) {
        case "chat-post-question":
            chat_render(message.value);
            break;
        case "chat-post-answer":
            chat_render(message.value);
            break;
        }
    });

})();

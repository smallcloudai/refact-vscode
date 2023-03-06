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

    function chat_render(data)
    {
        const question_div = document.createElement('div');
        question_div.classList.add('codify-chat__question');
        question_div.innerHTML = data.question;

        const answer_div = document.createElement('div');
        answer_div.classList.add('codify-chat__answer');
        answer_div.innerHTML = data.answer;

        const message_pair_div = document.createElement('div');
        message_pair_div.classList.add('codify-chat__item');
        message_pair_div.appendChild(question_div);
        message_pair_div.appendChild(answer_div);
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

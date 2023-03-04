/* eslint-disable @typescript-eslint/naming-convention */
(function () {
    const vscode = acquireVsCodeApi();
    const chat_input = document.querySelector('#chat-input');
    const chat_send_button = document.querySelector('#chat-send');
    const chat_content = document.querySelector('.codify-chat__content');

    chat_send_button.addEventListener('click', () => {
        const message = chat_input.value;
        vscode.postMessage({ type: "chat-message", value: message});
    });

    function chat_render(data) {
        const message_wrapper = document.createElement('div');
        message_wrapper.classList.add('codify-chat__item');
        const message_question = document.createElement('div');
        message_question.classList.add('codify-chat__question');
        message_question.innerHTML = data.question;
        const message_answer = document.createElement('div');
        message_answer.classList.add('codify-chat__answer');
        message_answer.innerHTML = data.answer;
        message_wrapper.appendChild(message_question);
        message_wrapper.appendChild(message_answer);
        chat_content.appendChild(message_wrapper);
    }

    window.addEventListener("message", (event) => {
		const message = event.data;
		switch (message.command) {
        case "chat-incoming":
            chat_render(message.value);
            break;
        }
    });

})();
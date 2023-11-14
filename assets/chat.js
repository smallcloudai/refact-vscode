/* eslint-disable @typescript-eslint/naming-convention */
(function () {
    const vscode = acquireVsCodeApi();
    const chat_input = document.querySelector('#chat-input');
    const chat_send_button = document.querySelector('#chat-send');
    const chat_content = document.querySelector('.refactcss-chat__content');
    const chat_panel = document.querySelector('.refactcss-chat__panel');
    const stop_button = document.querySelector('#chat-stop');
    let chat_controls_moved = false;
    const back_button = document.querySelector('.back-button');
    const regenerate_button = document.querySelector('.refactcss-chat__regenerate');
    const error_message = document.querySelector('#chat-error-message');
    const welcome_message = document.querySelector('.refactcss-chat__welcome');
    const chat_controls = document.querySelector('.refactcss-chat__controls');

    let is_error = false;
    let is_scrolled = false;

    back_button.addEventListener('click', () => {
        vscode.postMessage({ type: "back-from-chat" });
    });

    let initial_chat_height = chat_input.scrollHeight;
    let initial_panel_height = chat_panel.offsetHeight;
    let initial_message_height = chat_content.offsetHeight;

    function input_care() {
        let current_chat_height = chat_input.scrollHeight;
        let difference = current_chat_height - initial_chat_height;
    
        // chat_content.style.setProperty('height', (initial_message_height + difference) + 'px');
        chat_panel.style.height = current_chat_height + 'px';

        const message = chat_input.value;
        let bad = message.trim() === '' || message.length >= 4000;
        chat_send_button.disabled = bad;
        chat_send_button.style.opacity = bad ? 0.5 : 1;
    }

    chat_input.addEventListener('input', function () {
        input_care();
    });

    chat_input.addEventListener('focusin', function() {
        if(chat_input.value.length === 0) {
            chat_content.style.height = `calc(100% - 130px)`;
            chat_panel.style.height = '130px';
        } else {
            // message_panel.style.setProperty('height', 'calc(100% - ' + (chat_input.scrollHeight + 100) + 'px)');
            // chat_input.style.height = chat_input.scrollHeight + 'px';
            // chat_panel.style.height = chat_input.scrollHeight + 'px';
            let command_bar_height = chat_panel.offsetHeight - chat_input.offsetHeight;
            let calc_height = command_bar_height + chat_input.scrollHeight;
            chat_content.style.setProperty('height', 'calc(100% - ' + calc_height + 'px)');
        }
        auto_scroll();
    });

    chat_input.addEventListener('focusout', function() {
        chat_content.style.height = `calc(100% - 130px)`;
        chat_panel.style.height = '130px';
    });

    regenerate_button.addEventListener('click',() => {
        const message = chat_input.value;
        let chat_model_combo = document.getElementById("chat-model-combo");
        console.log(chat_model_combo.options[chat_model_combo.selectedIndex].value);
        chat_model = JSON.parse(chat_model_combo.options[chat_model_combo.selectedIndex].value);
        let chat_attach_file = document.getElementById("chat-attach");
        chat_input.value = '';
        regenerate_button.style.display = 'none';
        stop_button.style.display = 'flex';
        is_error = false;
        error_message.style.display = 'none';
        console.log(`last_answer_div ${last_answer_div}`);
        if (last_answer_div) {
            console.log(`last_answer_div messages_backup ${last_answer_div.dataset.messages_backup}`);
        }
        vscode.postMessage({
            type: "chat-question-enter-hit",
            chat_question: message,
            chat_model: chat_model,
            chat_attach_file: chat_attach_file.checked,
            chat_messages_backup: last_answer_div ? JSON.parse(last_answer_div.dataset.messages_backup) : [],
        });
    });

    chat_send_button.addEventListener('click', () => {
        welcome_message.style.display = 'none';
        chat_controls.style.display = 'none';
        // chat_input.style.marginTop = '43px';
        const message = chat_input.value;
        let chat_model_combo = document.getElementById("chat-model-combo");
        console.log(chat_model_combo.options[chat_model_combo.selectedIndex].value);
        chat_model = JSON.parse(chat_model_combo.options[chat_model_combo.selectedIndex].value);
        let chat_attach_file = document.getElementById("chat-attach");
        chat_input.value = '';
        console.log(`last_answer_div ${last_answer_div}`);
        if (last_answer_div) {
            console.log(`last_answer_div messages_backup ${last_answer_div.dataset.messages_backup}`);
        }
        vscode.postMessage({
            type: "chat-question-enter-hit",
            chat_question: message,
            chat_model: chat_model,
            chat_attach_file: chat_attach_file.checked,
            chat_messages_backup: last_answer_div ? JSON.parse(last_answer_div.dataset.messages_backup) : [],
        });
        // if (!chat_controls_moved) {
        //     const chat_controls = document.querySelector('.refactcss-chat__controls');
        //     const chat_content = document.querySelector('.refactcss-chat__content');
        //     chat_content.appendChild(chat_controls);
        //     chat_controls_moved = true;
        //     const chat_label = document.getElementById("chat-attach-label");
        //     const chat_input = document.getElementById("chat-attach");
        //     if (chat_input.checked) {
        //         chat_label.innerText = chat_label.innerText.replace("Attach", "Attached");
        //     }
        //     document.querySelector('.refactcss-chat__panel').style.maxHeight = '180px';
        // }
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

    let last_answer_div = null;  // unfinished answers go the same div
    let answer_counter = 0;

    function chat_render(data) {
        welcome_message.remove();
        chat_controls.style.display = 'none';
        // chat_input.style.marginTop = '43px';
        // question_html: html,
        // question_raw: question
        // answer_html: html,
        // answer_raw: answer
        if (Object.keys(data).length === 0) { return; };
        const message_pair_div = document.createElement('div');
        message_pair_div.classList.add('refactcss-chat__item');
        message_pair_div.dataset.answer_counter = answer_counter;

        if (data.question_html) {
            answer_counter += 1;

            const question_container = document.createElement('div'); // Parent container for question_div and message_edit_textarea
            question_container.classList.add('refactcss-chat__question');

            const question_div = document.createElement('div');
            question_div.classList.add('refactcss-chat__question_div');
            question_div.innerHTML = data.question_html;
            question_div.dataset.raw = data.question_raw;
            question_div.dataset.messages_backup = JSON.stringify(data.messages_backup);
            question_div.dataset.question_backup = data.question_raw;
            last_answer_div = null;

            const retry_button = document.createElement('button');
            retry_button.innerText = 'Retry';
            retry_button.classList.add('refactcss-chat__copybutton');

            const message_edit_textarea = document.createElement('textarea');
            message_edit_textarea.type = 'text';
            message_edit_textarea.style.display = 'none'; // Initially hidden
            message_edit_textarea.value = data.question_raw;
            message_edit_textarea.classList.add('refactcss-chat__input-field');

            const message_edit_cancel = document.createElement('button');
            message_edit_cancel.innerText = 'Cancel';
            message_edit_cancel.style.display = 'none'; // Initially hidden
            message_edit_cancel.classList.add('refactcss-chat__cancel-button');

            const message_edit_submit = document.createElement('button');
            message_edit_submit.innerText = 'Submit';
            message_edit_submit.style.display = 'none'; // Initially hidden
            message_edit_submit.classList.add('refactcss-chat__submit-button');

            question_container.appendChild(question_div);
            question_container.appendChild(message_edit_textarea);
            question_container.appendChild(retry_button);
            question_container.appendChild(message_edit_cancel);
            question_container.appendChild(message_edit_submit);
            message_pair_div.appendChild(question_container);

            message_edit_textarea.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && event.shiftKey === false) {
                    event.preventDefault();
                    message_edit_submit.click();
                    isAutoScrollPaused = false;
                    return true;
                }
                auto_scroll();
            });

            retry_button.addEventListener('click', () => {
                //console.log("message backup: " + question_div.dataset.messages_backup);

                //do nothing if chat-stop is visible
                if (stop_button.style.display !== 'none') {
                    return;
                }
                // vscode.postMessage({
                //     type: "reset-messages",
                //     messages_backup: JSON.parse(question_div.dataset.messages_backup)
                // });

                question_div.style.display = 'none';
                message_edit_textarea.style.display = 'block';
                message_edit_cancel.style.display = 'inline-block';
                message_edit_submit.style.display = 'inline-block';
                retry_button.style.display = 'none';
                message_edit_textarea.focus();
                message_edit_textarea.value = question_div.dataset.question_backup;
                answer_counter = parseInt(message_pair_div.dataset.answer_counter);
                // delete_up_to_answer_counter(answer_counter);
            });

            message_edit_cancel.addEventListener('click', () => {
                question_div.style.display = 'block';
                message_edit_textarea.style.display = 'none';
                retry_button.style.display = 'block';
                message_edit_cancel.style.display = 'none';
                message_edit_submit.style.display = 'none';

                // Restore the original question
                message_edit_textarea.value = data.question_raw;
            });

            message_edit_submit.addEventListener('click', () => {
                const message = message_edit_textarea.value;
                let chat_model_combo = document.getElementById("chat-model-combo");
                //console.log(chat_model_combo.options[chat_model_combo.selectedIndex].value);
                chat_model = JSON.parse(chat_model_combo.options[chat_model_combo.selectedIndex].value);
                let chat_attach_file = document.getElementById("chat-attach");
                message_edit_textarea.value = '';
                if (question_div) {
                    console.log(`messages backup was: ${question_div.dataset.messages_backup}`);
                }
                // FIXME
                vscode.postMessage({
                    type: "chat-question-enter-hit",
                    chat_question: message,
                    chat_model: chat_model,
                    chat_attach_file: chat_attach_file.checked,
                    chat_messages_backup: JSON.parse(question_div?.dataset.messages_backup)
                });
                // if (!chat_controls_moved) {
                //     // const chat_controls = document.querySelector('.refactcss-chat__controls');
                //     const chat_content = document.querySelector('.refactcss-chat__content');
                //     chat_content.appendChild(chat_controls);
                //     chat_controls_moved = true;
                //     const chat_label = document.getElementById("chat-attach-label");
                //     const chat_input = document.getElementById("chat-attach");
                //     if (chat_input.checked) {
                //         chat_label.innerText = chat_label.innerText.replace("Attach", "Attached");
                //     }
                //     document.querySelector('.refactcss-chat__panel').style.maxHeight = '180px';
                // }

                // Toggle visibility of elements
                retry_button.style.display = 'inline-block';
                message_edit_textarea.style.display = 'none';
                message_edit_cancel.style.display = 'none';
                message_edit_submit.style.display = 'none';

                //remove current chatItem as it would get re-added anyway
                const chats = document.querySelectorAll('.refactcss-chat__item');
                const last = chats[chats.length - 1];
                last.remove();
                isAutoScrollPaused = false;
                auto_scroll();
            });

            visibility_control(true);
        }

        if (!last_answer_div && data.answer_html) {
            const answer_div = document.createElement('div');
            answer_div.classList.add('refactcss-chat__answer');
            message_pair_div.appendChild(answer_div);
            last_answer_div = answer_div;
        }

        if (last_answer_div && data.answer_html) {
            last_answer_div.innerHTML = data.answer_html;
            last_answer_div.dataset.raw = data.answer_raw;
            last_answer_div.dataset.have_editor = data.have_editor;
            // backup does not include question (nor this answer))
            last_answer_div.dataset.messages_backup = JSON.stringify(data.messages_backup);
        }

        if (message_pair_div.children.length > 0) {
            chat_content.appendChild(message_pair_div);
        }
        hljs.highlightAll();
    }

    function delete_up_to_answer_counter(answer_counter)
    {
        const chats = document.querySelectorAll('.refactcss-chat__item');
        for (let i = chats.length - 1; i >= 0; i--) {
            const chat = chats[i];
            if (parseInt(chat.dataset.answer_counter) > answer_counter) {
                chat.remove();
            }
        }
    }

    function chat_add_code_buttons() {
        const chats = document.querySelectorAll('.refactcss-chat__item');
        if (chats.length === 0) { return; }
        const last = chats[chats.length - 1];
        const answer_div = last.querySelector('.refactcss-chat__answer');
        if (!answer_div) { return; }
        const snippets = answer_div.querySelectorAll('pre code');
        const raw = answer_div.dataset.raw;
        const raw_snippets = raw.split('```');
        for (let i = 0; i < snippets.length; i++) {
            const code_wrapper = document.createElement('div');
            if (!snippets[i].closest('.refactcss-chat__snippet')) {
                code_wrapper.classList.add('refactcss-chat__snippet');
                snippets[i].parentNode.replaceChild(code_wrapper, snippets[i]);
                code_wrapper.appendChild(snippets[i]);
            }

            let pre = snippets[i];
            // const code = pre.innerHTML;
            if (raw_snippets.length <= 2 * i + 1) {
                continue;
            }
            // const code = backquote_backquote_backquote_remove_language_name(raw_snippets[2 * i + 1]);
            const code = raw_snippets[2 * i + 1];
            const copy_button = document.createElement('button');
            const new_button = document.createElement('button');
            copy_button.innerText = 'Copy';
            copy_button.classList.add('refactcss-chat__copybutton');
            new_button.innerText = 'New File';
            new_button.classList.add('refactcss-chat__newbutton');
            copy_button.addEventListener('click', () => {
                copy_to_clipboard(code);
            });
            new_button.addEventListener('click', () => {
                vscode.postMessage({ type: "open-new-file", value: code });
            });
            if (answer_div.dataset.have_editor === 'true') {
                const diff_button = document.createElement('button');
                diff_button.addEventListener('click', () => {
                    vscode.postMessage({ type: "diff-paste-back", code_block: code });
                    diff_button.style.display = 'none';
                });
                diff_button.innerText = 'Diff';
                diff_button.classList.add('refactcss-chat__diffbutton');
                if(!code_wrapper.querySelector('.refactcss-chat__diffbutton')) {
                    code_wrapper.appendChild(diff_button);
                }
            }
            if(!code_wrapper.querySelector('.refactcss-chat__copybutton')) {
                code_wrapper.appendChild(copy_button);
            }
            if(!code_wrapper.querySelector('.refactcss-chat__newbutton')) {
                code_wrapper.appendChild(new_button);
            }
        }
        const codeButtons = document.querySelectorAll('.refactcss-chat__copybutton, .refactcss-chat__newbutton, .refactcss-chat__diffbutton');
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

    // TODO: Old scroll function, delete if new is working
    // let chatContent = document.querySelector('.refactcss-chat__content');

    // //auto scroll can be toggled by clicking on the chat content
    // let do_auto_scroll = true;
    // chatContent.addEventListener('click', function () {
    //     do_auto_scroll = !do_auto_scroll;
    // });
    // function auto_scroll() {
    //     input_care();
    //     if (do_auto_scroll) {
    //         chatContent.scrollTop = chatContent.scrollHeight;
    //     }

    // }

    let chatContent = document.querySelector('.refactcss-chat__content');
    let isAutoScrollPaused = false;

    function isScrolledToBottom() {
        return chatContent.scrollHeight - chatContent.clientHeight <= chatContent.scrollTop + 1;
    }

    chatContent.addEventListener('scroll', function() {
        if (isScrolledToBottom()) {
            isAutoScrollPaused = false;
        } else {
            isAutoScrollPaused = true;
        }
    });

    // old scroll
    // function auto_scroll() {
    //     input_care();
    //     if (!isAutoScrollPaused) {
    //         var currentScroll = chatContent.scrollTop;
    //         var distanceToScroll = chatContent.scrollHeight - chatContent.clientHeight - currentScroll;
    //         var duration = 300;
    //         var startTime = null;

    //         function scrollAnimation(timestamp) {
    //             if (!startTime) startTime = timestamp;
    //             var progress = (timestamp - startTime) / duration;
    //             chatContent.scrollTop = currentScroll + progress * distanceToScroll;
    //             if (progress < 1) requestAnimationFrame(scrollAnimation);
    //             else chatContent.scrollTop = chatContent.scrollHeight - chatContent.clientHeight;
    //         }

    //         requestAnimationFrame(scrollAnimation);
    //     }
    // }


    // new scroll to test
    function auto_scroll() {
        input_care();  
        if (!isAutoScrollPaused) {
            var currentScroll = chatContent.scrollTop;
            var distanceToScroll = chatContent.scrollHeight - chatContent.clientHeight - currentScroll;
            var duration = 300;
            var startTime = null; 
            function scrollAnimation(timestamp) {
                if (!startTime) startTime = timestamp;  
                var elapsed = timestamp - startTime;
                var progress = Math.min(1, elapsed / duration);
                var easedProgress = easeInOutQuad(progress);
                chatContent.scrollTop = currentScroll + easedProgress * distanceToScroll;
                if (progress < 1) {
                    requestAnimationFrame(scrollAnimation);
                } else {
                    chatContent.scrollTop = chatContent.scrollHeight - chatContent.clientHeight;
                }
            }  
            requestAnimationFrame(scrollAnimation); 
            function easeInOutQuad(t) {
                return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            }
        }
    }    
    
    window.addEventListener("message", (event) => {
        const message = event.data;
        console.log("CHATMESSAGE", message.command);
        let input_should_be_visible = true;
        // let isStreaming = false;
        switch (message.command) {
            case "chat-set-fireup-options":
                let chat_attach_file = document.getElementById("chat-attach");
                chat_attach_file.checked = message.chat_attach_default;
                let label = document.getElementById("chat-attach-label");
                if (message.chat_attach_file) {
                    label.innerText = `Attach ${message.chat_attach_file}`;
                } else {
                    label.innerText = `Attach file`;
                    label.style.opacity = 0.5;
                    label.parentElement.style.opacity = 0.35;
                    label.parentElement.style.pointerEvents = 'none';
                }
                input_should_be_visible = true;
                break;
            case "chat-models-populate":
                let chat_model_combo = document.getElementById("chat-model-combo");
                chat_model_combo.innerHTML = "";
                for (let i = 0; i < message.chat_models.length; i++) {
                    let option = document.createElement("option");
                    option.value = JSON.stringify(message.chat_models[i]);
                    option.text = message.chat_models[i];
                    if (message.chat_use_model === message.chat_models[i]) {
                        option.selected = true;
                    }
                    if (message.chat_use_model === "" && i === 0) {
                        option.selected = true;
                    }
                    chat_model_combo.appendChild(option);
                }
                input_should_be_visible = true;
                break;
            case "chat-end-streaming":
                input_should_be_visible = true;
                // isStreaming = false;
                break;
            case "chat-error-streaming":
                is_error = true;
                chat_input.value = message.backup_user_phrase;
                let chat_error_message = document.getElementById("chat-error-message");
                chat_error_message.innerText = message.error_message;
                document.querySelector('.refactcss-chat__regenerate').style.display = 'flex';
                chat_error_message.style.display = 'flex';
                chat_error_message.title = message.error_message;
                if (last_answer_div) {
                    last_answer_div.style.opacity = 0.5;
                }
                input_should_be_visible = false;
                // isStreaming = false;
                break;
            case "chat-post-question":
                chat_render(message);
                // isStreaming = false;
                input_should_be_visible = false;
                break;
            case "chat-post-decoration":
                last_answer_div = undefined;
                // fall through
            case "chat-post-answer":  // streaming also goes there, with partial answers
                chat_render(message);
                input_should_be_visible = false;
                // isStreaming = true;
                break;
            case "chat-set-question-text":
                input_should_be_visible = true;
                // isStreaming = false;
                chat_input.value = message.value.question;
                setTimeout(() => {
                    input_care();
                }, 100);
                input_care();
                break;
            case "chat-clear":
                delete_up_to_answer_counter(-1);
                break;
            case "nop":
                break;
        }
        visibility_control(input_should_be_visible);
        chat_add_code_buttons();  // isStreaming
        if (message.command.includes("streaming")) {
            chat_input.focus();
        }
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
        if(is_error) {
            stop_button.style.display = 'none';
            chat_input.style.display = 'none';
            chat_send_button.style.display = 'none';
            error_message.style.display = 'flex';
            regenerate_button.style.display = 'flex';
        }
        auto_scroll();
    }

    chat_input.focus();
})();

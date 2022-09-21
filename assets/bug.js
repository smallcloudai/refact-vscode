(function () {
	const vscode = acquireVsCodeApi();
    const buttonSubmit = document.querySelector('.s-submit');

    const thankYou = `<div class="s-body__thankyou"><h3>Thank you!</h3><div>Your bug report has been received! You helping us to make codify better!</div></div>`;

    window.addEventListener("message", (event) => {
		const message = event.data;
		switch (message.command) {
			case "sendResponse":
				let sbody = document.querySelector('.s-body');
				let sfooter = document.querySelector('.s-footer');
                sfooter.style.display = "none";
                sbody.innerHTML = thankYou;
        }
    });

    buttonSubmit.addEventListener("click",(event) => {
        let _text = document.querySelector('#comment');
        let _intent = _text.getAttribute('data-intent');
        let _funct = _text.getAttribute('data-function');
        let _comment = document.querySelector('#comment').value;
        let _source = false;
        const file = document.querySelector('#source');
        if(file && file.checked) {
            _source = true;
        }
        let data = {
            intent: _intent,
            function: _funct,
            source: _source,
            comment: _comment
        };
        vscode.postMessage({ type: "buttonSubmit", value: data });
    });
})();

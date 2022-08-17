(function(){
    const vscode = acquireVsCodeApi();
    let presets = document.querySelectorAll('.presets li');
    for(let i = 0; i < presets.length; i++) {
        presets[i].addEventListener('click', () => {
            let text = presets[i].innerText;
            quickInput.value = text;
            vscode.postMessage({ type: 'presetSelected', value: text });
        });
    }
    const quickInput = document.querySelector('#quickinput');
    quickInput.addEventListener("keyup", ({key}) => {
        if (key === "Enter") {
            vscode.postMessage({ type: 'quickInput', value: quickInput.value });
        }
    });
}());
(function(){
    const vscode = acquireVsCodeApi();
    let presets = document.querySelectorAll('.presets li');
    for(let i = 0; i < presets.length; i++) {
        presets[i].addEventListener('click', () => {
            let text = presets[i].innerText;
            vscode.postMessage({ type: 'presetSelected', value: text });
        });
    }
}());
import * as vscode from 'vscode';

/**
 * Creates statusbar clickable button
 * @param context
 * @returns
 */

 export class StatusBarMenu {
    menu: any = {};
    command: string = 'plugin-vscode.statusBarClick';

    createStatusBarBlock(context: vscode.ExtensionContext)
    {
        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        item.command = this.command;

        context.subscriptions.push(item);
        item.text = `$(codify-logo) codify`;
        item.tooltip = `Settings`;
        item.show();

        this.menu = item;

        return this.menu;
    }

    /**
     * Show or hide loading icon in statusbar
     * @param state boolean
     */
    statusbarLoading(state: boolean) {
        if(state) {
            this.menu.text = `$(sync~spin) codify`;
            // this.menu.color = '#ffff7d';
        }
        else {
            this.menu.text = `$(codify-logo) codify`;
            // this.menu.color = undefined;
        }
        return state;
    }

    statusbarError(state: boolean) {
        if(state) {
            this.menu.text = `$(testing-error-icon) codify`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
        else {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = undefined;
        }
        return state;
    }

    statusbarGuest(state: boolean) {
        if(state) {
            this.menu.text = `$(account) codify`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
        else {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = undefined;
        }
        return state;
    }

    statusbarLang(state: boolean) {
        if(state) {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
        else {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = undefined;
        }
        return state;
    }

    statusbarSocket(state: boolean) {
        if(state) {
            this.menu.text = `$(debug-disconnect) codify`;
            this.menu.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
        else {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = undefined;
        }
        return state;
    }

    apiError(msg: string) {
        global.menu.statusbarError(true);
        global.userLogged = false;
        vscode.window.showErrorMessage(msg);
    }
}
export default StatusBarMenu;
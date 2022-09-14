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
            this.menu.backgroundColor = '#6d5318';
        }
        else {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = undefined;
        }
        return state;
    }

    statusbarGuest(state: boolean) {
        if(state) {
            this.menu.text = `$(person) codify`;
            this.menu.backgroundColor = '#6d5318';
        }
        else {
            this.menu.text = `$(codify-logo) codify`;
            this.menu.backgroundColor = undefined;
        }
        return state;
    }
}
export default StatusBarMenu;
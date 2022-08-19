import * as vscode from 'vscode';

/**
 * Creates statusbar clickable button
 * @param context 
 * @returns 
 */

 export class StatusBarMenu {
    menu: any = {};

    createStatusBarBlock(context: vscode.ExtensionContext) {
        const statusBarMenu = 'myExtension.statusBarClick';
        context.subscriptions.push(vscode.commands.registerCommand(statusBarMenu, async () => 
        {
            const pageType = await vscode.commands.executeCommand("workbench.action.quickOpen", ">Codify:");
        }));
        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        // item.command = statusBarMenu;
    
        context.subscriptions.push(item);
        item.text = `$(codify-logo)codify`;
        // item.tooltip = `Click for commands`;
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
            this.menu.text = `$(sync~spin)codify`;
            this.menu.color = '#ffff7d';
        }
        else {
            this.menu.text = `$(codify-logo)codify`;
            this.menu.color = undefined;
        }
        return state;
    }
    
    statusbarError(state: boolean) {
        if(state) {
            this.menu.text = `$(testing-error-icon)codify`;
            this.menu.color = 'red';
        }
        else {
            this.menu.text = `$(codify-logo)codify`;
            this.menu.color = undefined;
        }
        return state;
    }
}
export default StatusBarMenu;
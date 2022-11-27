/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';
import * as userLogin from "./userLogin";



export async function report_success(
    positive: boolean,
    scope: string,
    related_url: string,
    error_message: string | any
) {
    if (typeof error_message !== "string") {
        error_message = JSON.stringify(error_message);
    }
    if (error_message.length > 200) {
        error_message = error_message.substring(0, 200) + "…";
    }

}

export function statusbarSocketError(
    problem: boolean,
    location: string,
    detail: any = undefined
) {



}


/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as fetchH2 from 'fetch-h2';
import * as fetchAPI from "./fetchAPI";
import * as userLogin from "./userLogin";

import { completionMetricPipeline } from "./metricCompletion";


export async function report_success_or_failure(
    positive: boolean,
    scope: string,
    related_url: string,
    error_message: string | any,
    model_name: string | undefined,
) {
    let invalid_session = false;
    let timedout = false;
    let conn_refused = false;
    if (typeof error_message !== "string") {
        if (error_message.code && error_message.code.includes("INVALID_SESSION")) {
            invalid_session = true;
        }
        if (error_message.code && error_message.code.includes("ETIMEDOUT")) {
            timedout = true;
        }
        if (error_message.code && error_message.code.includes("ECONNREFUSED")) {
            conn_refused = true;
        }
        if (error_message instanceof Error && error_message.message) {
            error_message = error_message.message;
        } else {
            error_message = JSON.stringify(error_message);
        }
    }
    if (typeof error_message === "string") {
        if (error_message.includes("INVALID_SESSION")) {
            invalid_session = true;
        }
        if (error_message.includes("ETIMEDOUT") || error_message.includes("timed out")) {
            timedout = true;
        }
        if (error_message.includes("ECONNREFUSED")) {
            conn_refused = true;
        }
    }
    if (!positive) {
        await fetchH2.disconnectAll();
        await fetchAPI.non_verifying_ctx.disconnectAll();
    } else {
        global.last_positive_result = Date.now();
    }
    if (invalid_session || conn_refused) {
        userLogin.inference_login_force_retry();
        console.log(["INVALID_SESSION, ECONNREFUSED => inference_login_force_retry"]);
    }
    if (timedout) {
        userLogin.inference_login_force_retry();
        // console.log(["ETIMEDOUT => disconnectAll"]);
    }
    if (error_message.length > 200) {
        error_message = error_message.substring(0, 200) + "…";
    }
    if (model_name) {
        global.status_bar.url_and_model_worked(related_url, model_name);
    }
    global.status_bar.set_socket_error(!positive, error_message);
    if (userLogin.check_if_login_worked()) {
        if (global.side_panel) {
            global.side_panel.update_webview();
        }
    } else {
        if (global.side_panel) {
            global.side_panel.update_webview();
        }
        global.status_bar.url_and_model_worked("", "");
    }
    let error_message_json = JSON.stringify(error_message);
    let msg = `${positive ? "1" : "0"}\t${scope}\t${related_url}\t${error_message_json}`;  // tabs for field separation, still human readable
    // Typical msg:
    // 1  "completion"  https://inference.smallcloud.ai/v1/contrast  ""
    // 0  "completion"  https://inference.smallcloud.ai/v1/contrast  "Could not verify your API key (3)"
    console.log([msg]);
    let global_context: vscode.ExtensionContext|undefined = global.global_context;
    if (global_context !== undefined) {
        let count_msg: { [key: string]: number } | undefined = await global_context.globalState.get("usage_stats");
        if (typeof count_msg !== "object") {
            count_msg = {};
        }
        if (count_msg[msg] === undefined) {
            count_msg[msg] = 1;
        } else {
            count_msg[msg] += 1;
        }
        await global_context.globalState.update(
            "usage_stats",
            count_msg
        );
    }
}


export async function report_increase_a_counter(
    scope: string,
    counter_name: string,
) {
    let global_context: vscode.ExtensionContext|undefined = global.global_context;
    if (!global_context) {
        return;
    }
    console.log(["increase_a_counter", scope, counter_name]);
    // {"scope1": {"counter1": 5, "counter2": 6}, "scope2": {"counter1": 5, "counter2": 6}}
    let usage_counters: { [key: string]: { [key: string]: number } } | undefined = await global_context.globalState.get("usage_counters");
    if (typeof usage_counters !== "object") {
        usage_counters = {};
    }
    if (usage_counters[scope] === undefined) {
        usage_counters[scope] = {};
    }
    if (usage_counters[scope][counter_name] === undefined) {
        usage_counters[scope][counter_name] = 1;
    } else {
        usage_counters[scope][counter_name] += 1;
    }
    await global_context.globalState.update("usage_counters", usage_counters);
}


export async function report_increase_tab_stats(feed: any, extension: string, gitExtension: any) {
    function generateSHA256Hash(input: string): string {
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256');
        hash.update(input);
        return hash.digest('hex');
    }

    function get_project_name() {
        let projectName = 'undefined';
        let username = 'undefined';

        if (gitExtension) {
            const git = gitExtension.isActive ? gitExtension.exports.getAPI(1) : null;
            if (git) {
                const repositories = git.repositories;
                if (repositories.length > 0) {
                    const projectPath = repositories[0].rootUri.path;
                    projectName = projectPath.substring(projectPath.lastIndexOf('/') + 1);

                    // const authorEmail = repositories[0].state.HEAD?.commit?.author.email;
                    // const username = authorEmail ? authorEmail.split('@')[0] : '';
                }
            }
        }
        return projectName;
    }

    let filename = feed.cursor_file;
    global.cm_current_file = filename;

    if (!global.cm_file_states) {
        global.cm_file_states = {};
    }
    if (global.cm_file_states[filename]) {
        global.cm_file_states[filename].push({'text': global.cm_document_text, 'completion': global.cm_completion});
    } else {
        global.cm_file_states[filename] = [{'text': global.cm_document_text, 'completion': global.cm_completion}];
    }

    if (global.cm_file_states[filename].length >= 2) {
        let state0 = global.cm_file_states[filename][0];
        let state1 = global.cm_file_states[filename][1];

        let score: [number, [number, number]];
        score = completionMetricPipeline(
            state0['text'],
            state1['text'],
            state0['completion']
        );

        let project_name = get_project_name();
        let project_hash = project_name;
        if (project_name !== 'undefined') {
            project_hash = generateSHA256Hash(project_name).slice(0, 16);
        }

        let global_context: vscode.ExtensionContext|undefined = global.global_context;
        if (!global_context) {
            return;
        }
        let scores_stats: Array <{[key: string]: any}> | undefined = await global_context.globalState.get("scores_stats");
        if (!scores_stats) {
            scores_stats = [];
        }

        scores_stats.push({
            "project_hash": project_hash,
            "file_ext": extension,
            "model_name": global.cm_last_model_name,
            "edit_score": score[0],
            "type_scores": [score[1][0], score[1][1]],
        });

        await global_context.globalState.update("scores_stats", scores_stats);

        global.cm_file_states[filename] = [state1];

        console.log('LENGTH', scores_stats.length);

        // // only for test; DELETEME!
        // if (scores_stats.length >= 5) {
        //     await report_tab_stats();
        // }
        // // END OF DELETEME
    }

}

async function report_tab_stats() {

    function merge_tab_stats(scores_stats: Array <{[key: string]: any}>): Array <{[key: string]: any}> {

        function get_avg(arr: Array<number>): number {
            const total = arr.reduce((acc, c) => acc + c, 0);
            return total / arr.length;
        }

        let tab_stats_merged = new Map();
        for (const stat of scores_stats) {
            let key = stat['project_hash'] + '/' + stat['file_ext'] + '/' + stat['model_name'];
            if (tab_stats_merged.has(key)) {
                let val = tab_stats_merged.get(key);
                val['edit_score'].push(stat['edit_score']);
                val['type_scores'][0] += stat['type_scores'][0];
                val['type_scores'][1] += stat['type_scores'][1];
                tab_stats_merged.set(key, val);
            } else {
                tab_stats_merged.set(key, {
                    "project_hash": stat['project_hash'],
                    "file_ext": stat['file_ext'],
                    "model_name": stat['model_name'],
                    "edit_score": [stat['edit_score']],
                    "type_scores": stat['type_scores'],
                });
            }
        }
        let tab_stats_final: Array <{[key: string]: any}> = [];
        for (const [_, val] of tab_stats_merged) {
            val['edit_score'] = get_avg(val['edit_score']);
            val['count'] = val['edit_score'].length;
            tab_stats_final.push(val);
        }
        return tab_stats_final;
    }
    let global_context: vscode.ExtensionContext|undefined = global.global_context;
    if (global_context === undefined) {
        return;
    }
    let scores_stats: Array <{[key: string]: any}> | undefined = await global_context.globalState.get("scores_stats");
    if (!scores_stats || scores_stats.length === 0) {
        return;
    }
    scores_stats = merge_tab_stats(scores_stats);

    const apiKey = userLogin.secret_api_key();
    if (!apiKey) {
        return;
    }
    let client_version = vscode.extensions.getExtension("smallcloud.codify")!.packageJSON.version;
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
    };
    let url = "https://www.smallcloud.ai/v1/tab-stats";
    let response = await fetchH2.fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
            "client_version": `vscode-${client_version}`,
            "usage": JSON.stringify(scores_stats),
        }),
    });

    if (response.status !== 200) {
        console.log([response.status, url]);
        return;
    }

    await global_context.globalState.update("scores_stats", undefined);
}


export async function report_usage_stats()
{
    await report_tab_stats();
    let global_context: vscode.ExtensionContext|undefined = global.global_context;
    if (global_context === undefined) {
        return;
    }
    let count_msg: { [key: string]: number } | undefined = await global_context.globalState.get("usage_stats");
    if (count_msg === undefined) {
        return;
    }
    let usage = "";
    for (let key in count_msg) {
        usage += `${key}\t${count_msg[key]}\n`;
    }
    const apiKey = userLogin.secret_api_key();
    if (!apiKey) {
        return;
    }
    let client_version = vscode.extensions.getExtension("smallcloud.codify")!.packageJSON.version;
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
    };
    let url = "https://www.smallcloud.ai/v1/usage-stats";
    let response = await fetchH2.fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
            "client_version": `vscode-${client_version}`,
            "usage": usage,
        }),
    });
    if (response.status !== 200) {
        console.log([response.status, url]);
        return;
    }
    await global_context.globalState.update("usage_stats", {});

    let usage_counters: { [key: string]: any } | undefined = await global_context.globalState.get("usage_counters");
    let usage_counters_size = usage_counters ? Object.keys(usage_counters).length : 0;
    if (usage_counters && usage_counters_size > 0) {
        url = "https://www.smallcloud.ai/v1/accept-reject-stats";
        usage_counters["ide_version"] = vscode.version;
        usage_counters["plugin_version"] = `vscode-${client_version}`;
        let usage_counters_str = JSON.stringify(usage_counters);
        response = await fetchH2.fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                "client_version": `vscode-${client_version}`,
                "usage": usage_counters_str,
            }),
        });
        if (response.status !== 200) {
            console.log([response.status, url]);
            return;
        }
        await global_context.globalState.update("usage_counters", undefined);
    }
}

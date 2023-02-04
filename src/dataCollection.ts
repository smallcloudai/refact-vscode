/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as userLogin from "./userLogin";
import * as estate from './estate';
import * as fetchH2 from 'fetch-h2';


export function data_feedback_candidate_reset(state: estate.StateOfEditor)
{
    console.log(["DATA FEEDBACK RESET"]);
    state.data_feedback_candidate = new estate.ApiFields();
    return state.data_feedback_candidate;
}


export async function data_collection_save_record(d: estate.ApiFields)
{
    if (d.sources[d.cursor_file] === undefined || d.results[d.cursor_file] === undefined || d.sources[d.cursor_file] === d.results[d.cursor_file]) {
        return;
    }
    d.ts_reacted = Date.now();
    // console.log([d.positive ? "👍" : "👎", "collection", result.status]);
    const payload = JSON.stringify({
        "positive": d.positive,
        "sources": d.sources,
        "results": d.results,
        "intent": d.intent,
        "function": d.function,
        "cursor_file": d.cursor_file,
        "cursor0": d.cursor_pos0,
        "cursor1": d.cursor_pos1,
        "ponder_time_ms": Math.round(d.ts_reacted - d.ts_presented),
    });
    const same_situation_key = `${d.intent} ${d.cursor_file}:${d.cursor_pos0}:${d.cursor_pos1} --` + d.sources[d.cursor_file];
    if (!global.global_context) {
        return;
    }
    let global_context: vscode.ExtensionContext = global.global_context;
    let rec_count_ = global_context.globalState.get("data_collection_rec_count");
    let rec_count = 0;
    if (rec_count_ !== undefined) {
        rec_count = rec_count_ as number;
    }
    if (rec_count > 500) {  // stop saving, user doesn't wish to interact with data collection at all :(
        return;
    }
    let zero_padded = rec_count.toString().padStart(4, "0");
    await global_context.globalState.update(`data_collection_rec[${zero_padded}]`, [same_situation_key, payload]);
    await global_context.globalState.update("data_collection_rec_count", rec_count + 1);
}


export function data_collection_prepare_package_for_sidebar()
{
    if (!global.global_context) {
        return;
    }
    let global_context: vscode.ExtensionContext = global.global_context;
    let rec_count_ = global_context.globalState.get("data_collection_rec_count");
    let rec_count = 0;
    if (rec_count_ !== undefined) {
        rec_count = rec_count_ as number;
    }
    let result: {[key: string]: string[]} = {};
    for (let i = 0; i < rec_count; i++) {
        let zero_padded = i.toString().padStart(4, "0");
        let rec = global_context.globalState.get(`data_collection_rec[${zero_padded}]`);
        if (rec === undefined) {
            continue;
        }
        let rec_ = rec as [string, string];
        let same_situation_key = rec_[0];
        let payload = rec_[1];
        if (result[same_situation_key] === undefined) {
            result[same_situation_key] = [];
        }
        result[same_situation_key].push(payload);
    }
    return result;
}


export async function data_collection_hurray_send_to_mothership()
{
    const apiKey = userLogin.secret_api_key();
    if (!apiKey) {
        return;
    }
    const url = "https://www.smallcloud.ai/v1/report-to-mothership";
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
    };
    let req = new fetchH2.Request(url, {
        method: "POST",
        headers: headers,
        // body: body,
        redirect: "follow",
        cache: "no-cache",
        referrer: "no-referrer",
    });
    try {
        let ans = await fetchH2.fetch(req);
        let json: any = await ans.json();
        // if (json.retcode === "OK") {
        //     usageStats.report_success_or_failure(true, "data collection", url, "", "");
    } catch (error) {
        console.log(["collection", "error", error]);
    }
}

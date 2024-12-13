import * as fetchAPI from "./fetchAPI";
import * as fetchH2 from 'fetch-h2';

export async function send_chat_telemetry(scope: string, success: boolean, error_message: string) {
    let url = fetchAPI.rust_url("/v1/telemetry-chat");
    if (!url) {
        console.log(["Failed to get url for /v1/telemetry-chat"]);
    }
    const post = JSON.stringify({
        "scope": scope,
        "success": success,
        "error_message": error_message, // if success == true then this is empty
    });
    const headers = {
        "Content-Type": "application/json",
    };
    let req = new fetchH2.Request(url, {
        method: "POST",
        headers: headers,
        body: post,
        redirect: "follow",
        cache: "no-cache",
        referrer: "no-referrer"
    });

    try {
        await fetchH2.fetch(req);
    } catch (error) {
        console.log("failed to post to /v1/telemetry-chat");
    }
}
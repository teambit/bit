//! Typed action errors and the released remote error messages.
use super::remote_error;
use reqwest::Response;
use serde_json::Value;
use std::io;

/// `Http.action` surfaces the server message to the command handler. In
/// particular `UnexpectedNetworkError.message` is the raw server message,
/// even though its inherited constructor formats a longer description.
pub(super) async fn throw_for_action_status(response: Response) -> io::Result<Response> {
    if response.status().is_success() {
        return Ok(response);
    }
    let url = response.url().to_string();
    let parsed: Value = response.json().await.unwrap_or(Value::Null);
    let error = if parsed["error"]["code"].is_null() { &parsed } else { &parsed["error"] };
    let message = error["message"]
        .as_str()
        .or_else(|| parsed["message"].as_str())
        .unwrap_or("unknown error")
        .to_owned();
    let code = error["code"].as_u64();
    Err(action_error(code, error, &url, message))
}

fn action_error(code: Option<u64>, error: &Value, url: &str, message: String) -> io::Error {
    match code {
        Some(127..=130) => remote_error(code, error, url, message),
        Some(131) => io::Error::other(ActionConflict(error.clone())),
        Some(135) => io::Error::other(ActionNotFound(
            error["name"]
                .as_str()
                .unwrap_or(&message)
                .to_owned(),
        )),
        Some(136) => io::Error::other(format!(
            "fatal: another client started exporting to the same scopes as yours within the exact same millisecond ({}), please try again.",
            error["clientId"].as_str().unwrap_or(&message),
        )),
        Some(137) => io::Error::other(format!(
            "fatal: the server is busy by other exports. total exports (including yours) in the queue: {},\nthe current export-id in queue is \"{}\".\nin a few minutes, bit.cloud will try to complete the export for you.\nif the remote scopes are not updated, please contact support.\n",
            error["queueSize"],
            error["currentExportId"].as_str().unwrap_or("undefined"),
        )),
        Some(138) => {
            let lane = error["laneName"].as_str().unwrap_or("undefined");
            let suffix = error["scopeName"]
                .as_str()
                .filter(|name| !name.is_empty())
                .map_or_else(
                    || format!(" locally. Please try with scope name, e.g. my-org.my-scope/{lane}"),
                    |scope| format!(r#" in scope "{scope}""#),
                );
            io::Error::other(format!(r#"lane "{lane}" was not found{suffix}"#))
        }
        _ => io::Error::other(message),
    }
}

/// Structured remote merge conflicts, whose CLI report applies terminal colors.
#[must_use]
pub fn action_conflict(error: &io::Error) -> Option<&Value> {
    error
        .get_ref()?
        .downcast_ref::<ActionConflict>()
        .map(|error| &error.0)
}

#[derive(Debug)]
struct ActionConflict(Value);

impl std::fmt::Display for ActionConflict {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.0["message"].as_str().unwrap_or("remote merge conflict"))
    }
}
impl std::error::Error for ActionConflict {}

/// Whether a remote rejected an action because its server predates that action.
#[must_use]
pub fn is_action_not_found(error: &io::Error) -> bool {
    error.get_ref().is_some_and(<dyn std::error::Error + Send + Sync>::is::<ActionNotFound>)
}

#[derive(Debug)]
struct ActionNotFound(String);

impl std::fmt::Display for ActionNotFound {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "action {} is unknown, it might happen when your client version is more recent than the server, your best bet is to update the server",
            self.0,
        )
    }
}

impl std::error::Error for ActionNotFound {}

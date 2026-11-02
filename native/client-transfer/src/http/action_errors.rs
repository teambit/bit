//! Typed action errors and the released remote error messages.
//!
//! [`throw_for_action_status`] translates HTTP [`Response`] status codes and JSON [`Value`] payloads into structured [`io::Error`] values.
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
    let error = if parsed["error"].is_object() { &parsed["error"] } else { &parsed };
    let message = non_empty_str(&error["message"])
        .or_else(|| non_empty_str(&parsed["message"]))
        .or_else(|| non_empty_str(&parsed["error"]))
        .unwrap_or("unknown error")
        .to_owned();
    Err(action_error(error_code(error).or_else(|| error_code(&parsed)), error, &url, message))
}

/// Extract a numeric action error code from `error["code"]` (integer or numeric string).
#[inline]
fn error_code(error: &Value) -> Option<u64> {
    error["code"]
        .as_u64()
        .or_else(|| {
            error["code"]
                .as_str()
                .and_then(|raw| raw.trim().parse().ok())
        })
}

#[inline]
fn non_empty_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

#[inline]
fn action_error(code: Option<u64>, error: &Value, url: &str, message: String) -> io::Error {
    match code {
        Some(127..=130) => remote_error(code, error, url, message),
        Some(131) => io::Error::other(ActionConflict(error.clone())),
        Some(135) => io::Error::other(ActionNotFound(
            non_empty_str(&error["name"]).unwrap_or(&message).to_owned(),
        )),
        Some(136) => io::Error::other(format!(
            "fatal: another client started exporting to the same scopes as yours within the exact same millisecond ({}), please try again.",
            non_empty_str(&error["clientId"]).unwrap_or(&message),
        )),
        Some(137) => {
            let queue_size = error["queueSize"]
                .as_u64()
                .map_or_else(
                    || non_empty_str(&error["queueSize"]).unwrap_or("undefined").to_owned(),
                    |size| size.to_string(),
                );
            io::Error::other(format!(
                "fatal: the server is busy by other exports. total exports (including yours) in the queue: {queue_size},\nthe current export-id in queue is \"{}\".\nin a few minutes, bit.cloud will try to complete the export for you.\nif the remote scopes are not updated, please contact support.\n",
                non_empty_str(&error["currentExportId"]).unwrap_or("undefined"),
            ))
        }
        Some(138) => {
            let lane = non_empty_str(&error["laneName"]).unwrap_or("undefined");
            let suffix = non_empty_str(&error["scopeName"])
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
#[inline]
#[must_use]
pub fn action_conflict(error: &io::Error) -> Option<&Value> {
    error
        .get_ref()?
        .downcast_ref::<ActionConflict>()
        .map(|error| &error.0)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ActionConflict(Value);

impl std::fmt::Display for ActionConflict {
    #[inline]
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(non_empty_str(&self.0["message"]).unwrap_or("remote merge conflict"))
    }
}
impl std::error::Error for ActionConflict {}

/// Whether a remote rejected an action because its server predates that action.
#[inline]
#[must_use]
pub fn is_action_not_found(error: &io::Error) -> bool {
    error.get_ref().is_some_and(<dyn std::error::Error + Send + Sync>::is::<ActionNotFound>)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ActionNotFound(String);

impl std::fmt::Display for ActionNotFound {
    #[inline]
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "action {} is unknown, it might happen when your client version is more recent than the server, your best bet is to update the server",
            self.0,
        )
    }
}

impl std::error::Error for ActionNotFound {}

/// `throwForNonOkStatus` with `remoteErrorHandler`'s messages.
pub(super) async fn throw_for_status(response: Response) -> io::Result<Response> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let url = response.url().to_string();
    let parsed: Value = response.json().await.unwrap_or(Value::Null);
    let error = if parsed["error"]["code"].is_null() { &parsed } else { &parsed["error"] };
    let message = non_empty_str(&error["message"])
        .or_else(|| non_empty_str(&parsed["message"]))
        .map_or_else(
            || {
                if crate::tar::truthy(error) {
                    "unknown error".to_owned()
                } else {
                    format!(
                        "url: {url}. status: {}. text: {}",
                        status.as_u16(),
                        status.canonical_reason().unwrap_or_default(),
                    )
                }
            },
            str::to_string,
        );
    Err(remote_error(error_code(error), error, &url, message))
}

#[inline]
pub(super) fn remote_error(
    code: Option<u64>,
    error: &Value,
    url: &str,
    message: String,
) -> io::Error {
    let text =
        |key: &str| non_empty_str(&error[key]).map_or_else(|| message.clone(), str::to_string);
    match code {
        Some(127) => io::Error::new(
            io::ErrorKind::NotFound,
            format!(r#"error: component "{}" was not found"#, text("id")),
        ),
        Some(128 | 130) => io::Error::new(
            io::ErrorKind::PermissionDenied,
            format!(
                "error: permission to scope {url} was denied\nsee troubleshooting at https://legacy-docs.bit.dev/setup-authentication#authentication-issues",
            ),
        ),
        Some(129) => io::Error::new(
            io::ErrorKind::NotFound,
            format!(r#"error: remote scope "{}" was not found."#, text("name")),
        ),
        Some(132 | 133) => io::Error::other(message),
        Some(138) => io::Error::new(io::ErrorKind::NotFound, LaneNotFound(message)),
        _ => io::Error::new(io::ErrorKind::ConnectionAborted, message),
    }
}

/// A remote explicitly reported that the requested lane does not exist.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaneNotFound(String);
impl std::fmt::Display for LaneNotFound {
    #[inline]
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}
impl std::error::Error for LaneNotFound {}

/// `UnexpectedNetworkError`.
#[inline]
pub(super) fn unexpected(message: &str) -> io::Error {
    let message = message.trim();
    io::Error::new(
        io::ErrorKind::ConnectionAborted,
        format!("unexpected network error has occurred.\nserver responded with: \"{message}\""),
    )
}

#[inline]
pub(super) fn network_error(error: &reqwest::Error) -> io::Error {
    unexpected(&error.to_string())
}

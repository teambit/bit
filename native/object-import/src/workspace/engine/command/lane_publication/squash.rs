#[cfg(test)]
#[path = "squash_tests.rs"]
mod tests;

use super::super::{invalid, merge::snapshot, repository::Repository};
use serde_json::{Value, json};
use std::io;

pub(super) struct Prepared {
    identity: String,
    hash: String,
    version: Value,
    replacement: Option<String>,
}
pub(super) fn prepare(
    hash: &str,
    version: &Value,
    model: &Value,
    distance: &Value,
    lane: &Value,
    title: Option<&str>,
    repository: &mut Repository,
) -> io::Result<Option<Prepared>> {
    let policy = crate::merge_state::squash_policy(json!({
        "sourceOnly":distance["sourceOnly"],"targetOnly":distance["targetOnly"],"common":distance["common"],
        "detachHead":false,"currentLaneDefault":lane["current"].is_null(),"currentParents":version["parents"],
        "isLegacy":version["schema"].is_null(),"mainHead":model["head"],"mainModelKnown":true,
    }))?;
    if policy["action"] == "skip" {
        return Ok(None);
    }
    if policy["action"] != "rewrite" {
        return Err(invalid("command lane squash policy"));
    }
    let mut value = version.clone();
    value["parents"] = policy["parents"].clone();
    value["squashed"] =
        json!({"previousParents":policy["previousParents"],"laneId":lane["otherId"]});
    let identity = format!(
        "{}/{}",
        model["scope"]
            .as_str()
            .map(str::trim)
            .filter(|scope| !scope.is_empty())
            .ok_or_else(|| invalid("squash model scope"))?,
        model["name"]
            .as_str()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| invalid("squash model name"))?,
    );
    let replacement = replacement_message(title, distance, lane, repository)?;
    Ok(Some(Prepared { identity, hash: hash.to_owned(), version: value, replacement }))
}
impl Prepared {
    pub(super) fn message_hash(&self) -> Option<&str> {
        self.replacement.as_ref().map(|_| self.hash.as_str())
    }
    pub(super) fn history(&self) -> (String, String, Value) {
        (self.identity.clone(), self.hash.clone(), self.version.clone())
    }
    pub(super) fn complete(&self, receipt: &Value) -> io::Result<Value> {
        let log = receipt["squashLog"].as_object().ok_or_else(|| invalid("command squash log"))?;
        if log
            .get("date")
            .and_then(Value::as_str)
            .is_none_or(|date| date.trim().is_empty())
        {
            return Err(invalid("command squash date"));
        }
        let mut version = self.version.clone();
        if version.get("modified").is_none() {
            version["modified"] = json!([]);
        }
        version["modified"]
            .as_array_mut()
            .ok_or_else(|| invalid("command squash modified logs"))?
            .push(json!(log));
        if let Some(message) = &self.replacement {
            replace_message(&mut version, &self.hash, message, receipt)?;
        }
        snapshot::object("Version", Some(&self.hash), version)
    }
}

fn replacement_message(
    title: Option<&str>,
    distance: &Value,
    lane: &Value,
    repository: &mut Repository,
) -> io::Result<Option<String>> {
    let Some(title) = title
        .map(str::trim)
        .filter(|title| !title.is_empty())
    else {
        return Ok(None);
    };
    let references =
        distance["targetOnly"].as_array().ok_or_else(|| invalid("squash message references"))?;
    let references = references
        .iter()
        .map(|reference| {
            reference
                .as_str()
                .map(str::trim)
                .filter(|hash| !hash.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| invalid("squash message hash"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    let scope = lane_scope(&lane["otherId"]).ok_or_else(|| invalid("squash message remote"))?;
    repository.prepare_lane_squash_messages(scope, &references)?;
    let mut messages = Vec::new();
    for hash in references {
        let value = repository.read(&hash, "Version")?;
        if let Some(message) = value["log"]
            .get("message")
            .filter(|message| !message.is_null())
        {
            let message = message.as_str().ok_or_else(|| invalid("squash log message"))?;
            if !message.is_empty() {
                messages.push(format!("[*] {message}"));
            }
        }
    }
    Ok(Some(format!("{title}\n{}", messages.join("\n"))))
}

fn lane_scope(other_id: &Value) -> Option<&str> {
    other_id
        .as_str()
        .and_then(|raw| raw.split_once('/').map(|(scope, _)| scope.trim()))
        .filter(|scope| !scope.is_empty())
        .or_else(|| {
            other_id["scope"]
                .as_str()
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
        })
}
fn replace_message(
    version: &mut Value,
    hash: &str,
    message: &str,
    receipt: &Value,
) -> io::Result<()> {
    let receipts = receipt["squashMessages"]
        .as_array()
        .ok_or_else(|| invalid("squash message date receipts"))?;
    let dates = receipts
        .iter()
        .filter(|entry| entry["hash"] == hash)
        .collect::<Vec<_>>();
    if dates.len() != 1 {
        return Err(invalid("squash message date identity"));
    }
    let date = dates[0]["date"]
        .as_str()
        .filter(|date| date.parse::<u64>().is_ok())
        .ok_or_else(|| invalid("squash message modification date"))?;
    let previous = version["log"]["message"]
        .as_str()
        .filter(|message| !message.is_empty())
        .unwrap_or("<empty>");
    let modified = json!({"date":date,"message":format!(r#"squashing: replacing the original log.message, which was: "{previous}""#)});
    version["modified"]
        .as_array_mut()
        .ok_or_else(|| invalid("squash modified logs"))?
        .push(modified);
    version["log"]
        .as_object_mut()
        .ok_or_else(|| invalid("squash version log"))?
        .insert("message".into(), json!(message));
    Ok(())
}

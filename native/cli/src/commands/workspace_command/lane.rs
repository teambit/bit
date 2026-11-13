//! `bit lane merge`: the lane pattern's
//! ids, and the lane step (`commandLaneFinalize`) with what the engine
//! cannot know about the lane objects it writes: history keys, logs and
//! squash dates (`commandLaneReceipt`).
//!
//! Extends [`Steps`] with [`validate`], [`pattern_ids`], [`Steps::finalize_lane`], and [`receipt`] generation ([`Map`] / [`Value`]).

#[cfg(test)]
mod lane_tests;

use super::{Steps, snapshot::receipt};
use crate::commands::{
    patterns,
    status::js::{array, decline, text},
};
use serde_json::{Map, Value, json};
use std::io;

/// A lane merge with `--no-snap` that squashes: Node treats the components
/// the lane is ahead on as diverged, then fails to squash them
/// (`unable to squash, the componentFromModel is missing`).
#[inline]
pub fn validate(
    options: &Value,
    context: &Value,
    internal_materialization: bool,
) -> io::Result<()> {
    let squash = context["lane"].get("shouldSquash") == Some(&Value::Bool(true));
    if options.get("lane").is_some()
        && options.get("noSnap") == Some(&Value::Bool(true))
        && squash
        && !internal_materialization
    {
        return Err(decline("a squashing lane merge without snaps"));
    }
    Ok(())
}

/// `commandLanePatternIds`: the lane targets matched by `options["pattern"]`, or `None` outside a filtered lane merge on `context` ([`Value`]).
pub fn pattern_ids(options: &Value, context: &Value) -> io::Result<Option<Vec<String>>> {
    let Some(pattern) = options
        .get("pattern")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|pat| !pat.is_empty() && options.get("lane").is_some())
    else {
        return Ok(None);
    };
    let parts = patterns::split(pattern);
    if parts
        .iter()
        .any(|part| part.starts_with('$') || part.contains(" AND "))
    {
        return Err(decline("command lane state selector requires workspace callbacks"));
    }
    let targets = array(context["lane"].get("targets"), "lane targets")?;
    if targets.len() > 4096 {
        return Err(decline("command lane pattern identities"));
    }
    let identities: Vec<&str> = targets
        .iter()
        .map(|target| text(target.get("identity")).map(str::trim))
        .collect::<io::Result<_>>()?;
    let mut distinct = std::collections::HashSet::with_capacity(identities.len());
    if identities
        .iter()
        .any(|id| id.is_empty() || !distinct.insert(*id))
    {
        return Err(decline("command lane pattern identities"));
    }
    let selected = patterns::matching(&identities, &parts)?;
    if selected.is_empty() {
        return Err(decline("command lane pattern has no matches"));
    }
    Ok(Some(
        selected
            .into_iter()
            .map(str::to_string)
            .collect(),
    ))
}

impl Steps<'_> {
    /// `finalizeLane`: the lane receipt ([`lane_receipt`]), `commandLaneFinalize`, and its
    /// result and progress over the `plan`'s ([`Value`]).
    pub(super) fn finalize_lane(
        &mut self,
        plan: &mut Value,
        preparation: &Value,
    ) -> io::Result<()> {
        let receipt = lane_receipt(self.root, preparation, self.context)?;
        let finalized: Value = self.engine.request(&json!({
            "kind": "commandLaneFinalize",
            "token": self.token,
            "laneReceipt": receipt,
        }))?;
        if finalized
            .get("token")
            .and_then(Value::as_str)
            .map(str::trim)
            != Some(self.token.trim())
        {
            return Err(decline("command lane finalization receipt"));
        }
        let progress = plan["progress"].clone();
        for (key, value) in
            finalized.as_object().ok_or_else(|| decline("command lane finalization receipt"))?
        {
            plan[key] = value.clone();
        }
        if let (Some(base), Some(update)) =
            (progress.as_object(), finalized["progress"].as_object())
        {
            let mut merged = base.clone();
            merged.extend(update.clone());
            plan["progress"] = Value::Object(merged);
        } else {
            plan["progress"] = progress;
        }
        Ok(())
    }
}

/// `commandLaneReceipt(preparation, context)`.
fn lane_receipt(root: &std::path::Path, preparation: &Value, context: &Value) -> io::Result<Value> {
    let count = history_count(preparation)?;
    let history = preparation
        .get("history")
        .and_then(Value::as_bool)
        .ok_or_else(|| decline("command lane preparation receipt"))?;
    let hashes = squash_hashes(preparation)?;
    let other = other_lane(context)?;
    let squash = context["lane"]
        .get("shouldSquash")
        .and_then(Value::as_bool)
        .ok_or_else(|| decline("command lane squash receipt"))?;
    if !hashes.is_empty() && !squash {
        return Err(decline("command lane squash message without squash"));
    }
    let user = receipt::User::load(root)?;
    let mut receipt = Map::new();
    receipt.insert("importHistories".into(), import_histories(&user, count)?);
    if squash {
        let mut log = user.log();
        log["message"] = json!(format!("squashed during merge from {other}"));
        receipt.insert("squashLog".into(), log);
    }
    if !hashes.is_empty() {
        let date = user.log()["date"].clone();
        let messages = hashes
            .iter()
            .map(|hash| json!({ "hash": hash, "date": date }))
            .collect();
        receipt.insert("squashMessages".into(), Value::Array(messages));
    }
    if history {
        receipt.insert("historyKey".into(), json!(receipt::uuid_v4()?));
        receipt.insert("log".into(), user.log());
    }
    Ok(Value::Object(receipt))
}

/// `importHistoryCount`: at most 4096, none when absent.
#[inline]
fn history_count(preparation: &Value) -> io::Result<u64> {
    match preparation.get("importHistoryCount") {
        None | Some(Value::Null) => Ok(0),
        Some(count) => count
            .as_u64()
            .filter(|count| *count <= 4096)
            .ok_or_else(|| decline("command lane preparation receipt")),
    }
}

/// One history key and log per imported lane history.
#[inline]
fn import_histories(user: &receipt::User, count: u64) -> io::Result<Value> {
    let histories = (0..count)
        .map(|_| Ok(json!({ "historyKey": receipt::uuid_v4()?, "log": user.log() })))
        .collect::<io::Result<Vec<_>>>()?;
    Ok(Value::Array(histories))
}

/// `squashMessageHashes`: distinct snap hashes.
fn squash_hashes(preparation: &Value) -> io::Result<Vec<String>> {
    let hashes = match preparation.get("squashMessageHashes") {
        None | Some(Value::Null) => return Ok(Vec::new()),
        Some(hashes) => array(Some(hashes), "squash message hashes")?,
    };
    let hash = |value: &Value| -> Option<String> {
        value
            .as_str()
            .map(str::trim)
            .filter(|hash| {
                hash.len() == 40
                    && hash
                        .bytes()
                        .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
            })
            .map(str::to_string)
    };
    let mut seen = Vec::with_capacity(hashes.len());
    for value in hashes {
        let hash = hash(value).ok_or_else(|| decline("command lane squash message receipt"))?;
        if seen.contains(&hash) || seen.len() >= 4096 {
            return Err(decline("command lane squash message receipt"));
        }
        seen.push(hash);
    }
    Ok(seen)
}

/// `commandOtherLane(context)`: the merged lane's `scope/name`.
#[inline]
fn other_lane(context: &Value) -> io::Result<String> {
    let other = &context["lane"]["otherId"];
    if let Some((scope, name)) = other
        .as_str()
        .map(str::trim)
        .and_then(|value| value.split_once('/'))
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
    {
        return Ok(format!("{scope}/{name}"));
    }
    match (non_empty_str(&other["scope"]), non_empty_str(&other["name"])) {
        (Some(scope), Some(name)) => Ok(format!("{scope}/{name}")),
        _ => Err(decline("command lane identity receipt")),
    }
}

#[inline]
fn non_empty_str(val: &Value) -> Option<&str> {
    val.as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

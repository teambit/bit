//! Phase-ordered execution journal ([`State`], [`Record`]) and fork-receipt verification for `bit reset`.

use super::{bound, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashMap, io};
/// Session-scoped `bit reset` execution journal tracking active reset phase records.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(crate) struct State {
    records: HashMap<String, Record>,
    sequence: u64,
}
/// Single active `bit reset` phase-journal record tracking cursor, revision, and fork state.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Record {
    phases: Vec<&'static str>,
    cursor: usize,
    revision: u32,
    count: usize,
    parent: Option<String>,
    forked: bool,
    remaining: usize,
}
/// Deserialized `historyResetBegin` request payload specifying reset mode and flags.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Begin {
    mode: String,
    pattern: bool,
    head: bool,
    force: bool,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    token: String,
    revision: u32,
    phase: String,
    next_count: Option<usize>,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct Fork {
    token: String,
    revision: u32,
    count: usize,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct Token {
    token: String,
}
impl Record {
    #[inline]
    fn output(&self, token: &str) -> Value {
        json!({"token":token,"revision":self.revision,"directive":{"phase":self.phases.get(self.cursor).copied().unwrap_or("done"),"count":self.count}})
    }
    fn advance(&mut self, count: Option<usize>) -> io::Result<()> {
        if let Some(count) = count {
            bound(count)?;
        }
        if self.cursor >= self.phases.len() {
            return Err(invalid("terminal reset journal"));
        }
        self.revision =
            self.revision.checked_add(1).ok_or_else(|| invalid("reset revision overflow"))?;
        self.cursor += 1;
        self.count = if self.cursor == self.phases.len() {
            0
        } else if self.phases.get(self.cursor) == Some(&"components") {
            count.unwrap_or(1)
        } else {
            1
        };
        Ok(())
    }
}
impl State {
    pub(super) fn begin(&mut self, input: Value) -> io::Result<Value> {
        let request: Begin = serde_json::from_value(input).map_err(io::Error::other)?;
        let record = Record {
            phases: phases(&request)?,
            cursor: 0,
            revision: 0,
            count: 1,
            parent: None,
            forked: false,
            remaining: 0,
        };
        self.insert(record)
    }
    fn insert(&mut self, record: Record) -> io::Result<Value> {
        if self.records.len() >= 4096 {
            return Err(invalid("reset journal owner limit"));
        }
        let sequence =
            self.sequence.checked_add(1).ok_or_else(|| invalid("reset journal token overflow"))?;
        let token = crate::validate::hexadecimal(&Sha1::digest(sequence.to_be_bytes()));
        let output = record.output(&token);
        self.sequence = sequence;
        self.records.insert(token, record);
        Ok(output)
    }
    pub(super) fn receipt(&mut self, input: Value) -> io::Result<Value> {
        let request: Receipt = serde_json::from_value(input).map_err(io::Error::other)?;
        super::text(&request.token)?;
        super::text(&request.phase)?;
        let token = request.token.trim();
        let (parent_token, completed) = {
            let record = self.records.get_mut(token).ok_or_else(|| invalid("stale reset owner"))?;
            if record.revision != request.revision
                || record.phases.get(record.cursor).copied() != Some(request.phase.trim())
            {
                return Err(invalid("stale reset receipt"));
            }
            if record.remaining != 0 {
                return Err(invalid("incomplete reset children"));
            }
            (record.parent.clone(), record.cursor + 1 == record.phases.len())
        };
        if completed
            && let Some(parent_token) = &parent_token
            && self.records
                .get(parent_token)
                .is_none_or(|parent| parent.remaining == 0)
        {
            return Err(invalid("stale reset parent"));
        }
        let record = self.records.get_mut(token).ok_or_else(|| invalid("stale reset owner"))?;
        record.advance(request.next_count)?;
        let output = record.output(token);
        if completed
            && let Some(parent_token) = &parent_token
            && let Some(parent) = self.records.get_mut(parent_token)
        {
            parent.remaining -= 1;
        }
        Ok(output)
    }
    pub(super) fn fork(&mut self, input: Value) -> io::Result<Value> {
        let request: Fork = serde_json::from_value(input).map_err(io::Error::other)?;
        let token = request.token.trim().to_owned();
        let record = self.prepare_fork(&request, &token)?;
        let mut children = Vec::with_capacity(request.count);
        for index in 0..request.count {
            let child = Record {
                phases: vec![
                    "model",
                    "bitmap",
                    "laneHeads",
                    "localVersions",
                    "headGuard",
                    "dependents",
                    "batchIds",
                    "removeRefs",
                    "result",
                ],
                cursor: 0,
                revision: 0,
                count: 1,
                parent: Some(token.clone()),
                forked: false,
                remaining: 0,
            };
            let mut output = self.insert(child)?;
            output["index"] = json!(index);
            children.push(output);
        }
        let mut output = record.output(&token);
        output["children"] = json!(children);
        self.records.insert(token, record);
        Ok(output)
    }
    fn prepare_fork(&self, request: &Fork, token: &str) -> io::Result<Record> {
        bound(request.count)?;
        if self.records.len().saturating_add(request.count) > 4096 {
            return Err(invalid("reset child owner limit"));
        }
        let mut record = self.records
            .get(token)
            .cloned()
            .ok_or_else(|| invalid("stale reset parent"))?;
        if record.revision != request.revision
            || record.phases.get(record.cursor) != Some(&"components")
            || record.forked
            || record.count != request.count
        {
            return Err(invalid("reset fork phase"));
        }
        self.sequence
            .checked_add(request.count as u64)
            .ok_or_else(|| invalid("reset child sequence overflow"))?;
        record.revision =
            record.revision.checked_add(1).ok_or_else(|| invalid("reset revision overflow"))?;
        record.forked = true;
        record.remaining = request.count;
        Ok(record)
    }
    pub(super) fn finish(&mut self, input: Value) -> io::Result<Value> {
        let request: Token = serde_json::from_value(input).map_err(io::Error::other)?;
        super::text(&request.token)?;
        let token = request.token.trim();
        if self.records
            .get(token)
            .ok_or_else(|| invalid("stale reset finish"))?
            .parent
            .is_some()
        {
            return Err(invalid("reset child cannot finish parent journal"));
        }
        self.records.remove(token);
        self.records.retain(|_, record| record.parent.as_deref() != Some(token));
        Ok(json!({"finished":true}))
    }
}
fn phases(request: &Begin) -> io::Result<Vec<&'static str>> {
    match request.mode.trim() {
        "real" => {
            let mut phases = vec!["captureLane", "candidates"];
            if request.pattern {
                phases.push("pattern");
            }
            if request.pattern && !request.force && request.head {
                phases.push("batchGuard");
            }
            phases.extend([
                "components",
                "laneHistory",
                "persist",
                "bitmap",
                "stagedWrite",
                "destroy",
            ]);
            Ok(phases)
        }
        "soft" => {
            let mut phases = vec!["captureLane", "softCandidates"];
            if request.pattern {
                phases.push("softPattern");
            }
            phases.extend(["softApply", "markBitmap", "destroy"]);
            Ok(phases)
        }
        "neverExported" => Ok(vec!["ids", "deleteObjects", "updateBitmap", "writeBitmap"]),
        _ => Err(invalid("reset mode")),
    }
}

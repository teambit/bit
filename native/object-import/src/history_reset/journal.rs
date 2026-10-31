use super::{bound, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashMap, io};
#[derive(Default)]
pub(crate) struct State {
    records: HashMap<String, Record>,
    sequence: u64,
}
#[derive(Clone)]
struct Record {
    phases: Vec<&'static str>,
    cursor: usize,
    revision: u32,
    count: usize,
    parent: Option<String>,
    forked: bool,
    remaining: usize,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Begin {
    mode: String,
    pattern: bool,
    head: bool,
    force: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    token: String,
    revision: u32,
    phase: String,
    next_count: Option<usize>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Fork {
    token: String,
    revision: u32,
    count: usize,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Token {
    token: String,
}
impl Record {
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
        let token = request.token.trim().to_owned();
        let mut record = self.records
            .get(&token)
            .cloned()
            .ok_or_else(|| invalid("stale reset owner"))?;
        if record.revision != request.revision
            || record.phases.get(record.cursor).copied() != Some(request.phase.trim())
        {
            return Err(invalid("stale reset receipt"));
        }
        if record.remaining != 0 {
            return Err(invalid("incomplete reset children"));
        }
        record.advance(request.next_count)?;
        self.complete_child(&record)?;
        let output = record.output(&token);
        self.records.insert(token, record);
        Ok(output)
    }
    fn complete_child(&mut self, record: &Record) -> io::Result<()> {
        if record.cursor != record.phases.len() {
            return Ok(());
        }
        if let Some(token) = &record.parent {
            let parent =
                self.records.get_mut(token).ok_or_else(|| invalid("stale reset parent"))?;
            parent.remaining =
                parent.remaining.checked_sub(1).ok_or_else(|| invalid("reset child completion"))?;
        }
        Ok(())
    }
    pub(super) fn fork(&mut self, input: Value) -> io::Result<Value> {
        let request: Fork = serde_json::from_value(input).map_err(io::Error::other)?;
        let token = request.token.trim().to_owned();
        let record = self.prepare_fork(&request, &token)?;
        let mut children = Vec::new();
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
        if self.records.len() + request.count > 4096 {
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
        let token = request.token.trim();
        self.records.remove(token).ok_or_else(|| invalid("stale reset finish"))?;
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

use super::invalid;
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashMap, io};

#[derive(Default)]
pub(super) struct State {
    records: HashMap<String, Record>,
    sequence: u64,
}
#[derive(Clone)]
struct Record {
    mode: String,
    cursor: usize,
    index: usize,
    batch: usize,
    plans: usize,
    revision: u32,
    parent: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Begin {
    mode: String,
    count: usize,
    parent_token: Option<String>,
    import_main: Option<bool>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    token: String,
    revision: u32,
    phase: String,
    index: usize,
    completed: usize,
    next_count: Option<usize>,
}
const STATUS: &[&str] = &["importMain", "status", "importGap", "plans", "clearTemps"];
const APPLY: &[&str] = &[
    "prompt",
    "results",
    "apply",
    "writeMany",
    "workspaceConfig",
    "configConflict",
    "configFiles",
    "laneHistory",
    "persist",
    "pendingWrite",
    "bitmap",
    "workspacePolicy",
    "componentRemove",
    "conflicts",
    "install",
    "updatedComponents",
    "bitmapSnapBeforeAutoSnap",
    "snap",
    "report",
];
const LANE: &[&str] = &[
    "validateFlags",
    "context",
    "upToDate",
    "status",
    "pattern",
    "workspaceFilter",
    "throwForFailures",
    "squash",
    "artifacts",
    "lastMergedSnapshot",
    "apply",
    "persistLastMergedSnapshot",
    "readme",
    "report",
    "importReferencedDeps",
    "destroy",
];
impl Record {
    fn phases(&self) -> &[&str] {
        match self.mode.as_str() {
            "status" => STATUS,
            "apply" => APPLY,
            _ => LANE,
        }
    }
    fn phase(&self) -> &str {
        self.phases()
            .get(self.cursor)
            .copied()
            .unwrap_or("done")
    }
    fn serial(&self) -> bool {
        (self.mode == "status" && self.phase() == "status")
            || (self.mode == "apply" && self.phase() == "apply")
    }
    fn count(&self) -> usize {
        if self.phase() == "done" {
            0
        } else if self.mode == "status" && self.phase() == "plans" {
            self.plans
        } else {
            1
        }
    }
    fn output(&self, token: &str) -> Value {
        json!({"token":token,"revision":self.revision,"directive":{"phase":self.phase(),"index":self.index,"count":self.count()}})
    }
    fn advance(&mut self, next: Option<usize>) -> io::Result<()> {
        if self.phase() == "done" {
            return Err(invalid("terminal merge journal"));
        }
        if let Some(count) = next {
            bound(count)?;
        }
        if self.mode == "status" && self.phase() == "importGap" {
            self.plans = next.unwrap_or(0);
        }
        if self.serial() {
            self.batch = next.unwrap_or(self.batch);
            if self.index.saturating_add(1) < self.batch {
                self.index = self.index.saturating_add(1);
                return Ok(());
            }
        }
        self.cursor = self.cursor.saturating_add(1);
        self.index = 0;
        if self.serial() {
            self.batch = next.unwrap_or(self.batch);
            if self.batch == 0 {
                self.cursor = self.cursor.saturating_add(1);
            }
        }
        Ok(())
    }
}
impl State {
    pub(super) fn begin(&mut self, input: Value) -> io::Result<Value> {
        let request: Begin = serde_json::from_value(input).map_err(io::Error::other)?;
        bound(request.count)?;
        let mode = request.mode.trim().to_owned();
        if !["status", "apply", "lane"].contains(&mode.as_str()) || self.records.len() >= 4096 {
            return Err(invalid("merge journal mode or limit"));
        }
        let parent_token = request.parent_token
            .as_deref()
            .map(str::trim)
            .filter(|parent| !parent.is_empty())
            .map(str::to_owned);
        if let Some(parent) = &parent_token {
            self.live(parent)?;
        }
        let mut record = Record {
            mode,
            cursor: 0,
            index: 0,
            batch: request.count,
            plans: 0,
            revision: 0,
            parent: parent_token,
        };
        if record.mode == "status" && request.import_main != Some(true) {
            record.cursor = 1;
            if record.batch == 0 {
                record.cursor = 2;
            }
        }
        self.sequence =
            self.sequence.checked_add(1).ok_or_else(|| invalid("merge token overflow"))?;
        let token = crate::validate::hexadecimal(&Sha1::digest(format!("merge:{}", self.sequence)));
        let output = record.output(&token);
        self.records.insert(token, record);
        Ok(output)
    }
    pub(super) fn receipt(&mut self, input: Value) -> io::Result<Value> {
        let request: Receipt = serde_json::from_value(input).map_err(io::Error::other)?;
        let token = request.token.trim().to_owned();
        let mut record = self.live(&token)?.clone();
        if record.revision != request.revision
            || record.phase() != request.phase.trim()
            || record.index != request.index
            || record.count() != request.completed
        {
            return Err(invalid("stale merge receipt"));
        }
        record.advance(request.next_count)?;
        record.revision =
            record.revision.checked_add(1).ok_or_else(|| invalid("merge revision overflow"))?;
        let output = record.output(&token);
        self.records.insert(token, record);
        Ok(output)
    }
    fn live(&self, token: &str) -> io::Result<&Record> {
        let original = self.records.get(token).ok_or_else(|| invalid("stale merge owner"))?;
        let mut record = original;
        for _ in 0..4096 {
            let Some(parent) = &record.parent else { return Ok(original) };
            record = self.records.get(parent).ok_or_else(|| invalid("stale merge ancestor"))?;
        }
        Err(invalid("merge owner ancestry limit"))
    }
    pub(super) fn verify(&self, token: &str, index: usize) -> io::Result<()> {
        let record = self.live(token)?;
        if record.phase() == "done" || index >= record.batch {
            return Err(invalid("merge component ownership"));
        }
        Ok(())
    }
    pub(super) fn verify_owner(&self, token: &str, index: usize) -> io::Result<()> {
        let record = self.live(token)?;
        if record.phase() == "done" || index != 0 {
            return Err(invalid("merge operation ownership"));
        }
        Ok(())
    }
    pub(super) fn verify_retained(&self, token: &str, index: usize) -> io::Result<()> {
        self.live(token)?;
        bound(index)?;
        Ok(())
    }
    pub(super) fn finish(&mut self, token: &str) -> io::Result<Vec<String>> {
        self.live(token)?;
        let mut removed = vec![token.to_owned()];
        loop {
            let children: Vec<String> = self.records
                .iter()
                .filter(|(key, record)| {
                    !removed.contains(key)
                        && record.parent
                            .as_ref()
                            .is_some_and(|parent| removed.contains(parent))
                })
                .map(|(key, _)| key.clone())
                .collect();
            if children.is_empty() {
                break;
            }
            removed.extend(children);
        }
        for key in &removed {
            self.records.remove(key);
        }
        Ok(removed)
    }
}
fn bound(count: usize) -> io::Result<()> {
    if count > 4096 { Err(invalid("merge count limit")) } else { Ok(()) }
}

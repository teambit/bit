//! Session-scoped history query plan registry ([`State`], [`Plan`]) and token lifecycle management.

use super::{bfs, blame, diff, files, invalid, populate, sources::Cache};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashMap, io, path::PathBuf};

/// Session-scoped registry of active history query plans and their byte budgets.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(crate) struct State {
    plans: HashMap<String, Plan>,
    sequence: u64,
    bytes: usize,
}
/// Active history query plan entry with its objects directory, byte size, and [`Cache`].
#[derive(Debug, Clone, PartialEq, Eq)]
struct Plan {
    value: Value,
    directory: PathBuf,
    bytes: usize,
    sources: Cache,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct Token {
    token: String,
}
impl State {
    pub(super) fn begin(&mut self, input: Value) -> io::Result<Value> {
        let directory = directory(&input)?;
        self.insert(bfs::begin(input)?, directory)
    }
    pub(super) fn populate_begin(&mut self, input: Value) -> io::Result<Value> {
        let directory = directory(&input)?;
        self.insert(populate::begin(input)?, directory)
    }
    fn insert(&mut self, mut plan: Value, directory: PathBuf) -> io::Result<Value> {
        if self.plans.len() >= 4096 {
            return Err(invalid("history query owner limit"));
        }
        let sequence =
            self.sequence.checked_add(1).ok_or_else(|| invalid("history query token overflow"))?;
        let token = crate::validate::hexadecimal(&Sha1::digest(sequence.to_be_bytes()));
        plan["token"] = json!(token);
        let bytes = serde_json::to_vec(&plan).map_err(io::Error::other)?.len();
        let source_bytes = self.plans
            .values()
            .map(|plan| plan.sources.bytes)
            .fold(0_usize, usize::saturating_add);
        if bytes > 4 * 1024 * 1024 - 200
            || self.bytes.saturating_add(bytes).saturating_add(source_bytes) > 32 * 1024 * 1024
        {
            return Err(invalid("history query owner limit"));
        }
        self.sequence = sequence;
        self.bytes = self.bytes.saturating_add(bytes);
        self.plans.insert(
            token,
            Plan { value: plan.clone(), directory, bytes, sources: Cache::default() },
        );
        Ok(plan)
    }
    pub(super) fn diff(&mut self, input: Value) -> io::Result<Value> {
        let request: diff::Request = serde_json::from_value(input).map_err(io::Error::other)?;
        let cache = self.sources(&request.token, &request.objects_directory)?;
        diff::diff(request, cache)
    }
    pub(super) fn blame(&mut self, input: Value) -> io::Result<Value> {
        let request: blame::Request = serde_json::from_value(input).map_err(io::Error::other)?;
        let cache = self.sources(&request.token, &request.objects_directory)?;
        blame::blame(request, cache)
    }
    fn sources(&mut self, token: &str, directory: &std::path::Path) -> io::Result<&mut Cache> {
        let token = token.trim();
        let total_used: usize = self.plans
            .values()
            .map(|plan| plan.sources.bytes)
            .fold(0_usize, usize::saturating_add);
        let plan = self.plans.get_mut(token).ok_or_else(|| invalid("stale history query"))?;
        let directory =
            directory.to_str().map_or(directory, |text| std::path::Path::new(text.trim()));
        if plan.directory != directory {
            return Err(invalid("history query directory mismatch"));
        }
        let used = total_used.saturating_sub(plan.sources.bytes);
        plan.sources.limit =
            (32_usize * 1024 * 1024).saturating_sub(self.bytes).saturating_sub(used);
        Ok(&mut plan.sources)
    }
    pub(super) fn files(&self, input: Value) -> io::Result<Value> {
        let request: files::Request = serde_json::from_value(input).map_err(io::Error::other)?;
        let plan =
            self.plans.get(request.token.trim()).ok_or_else(|| invalid("stale history query"))?;
        files::lineage(request, &plan.value)
    }
    pub(super) fn finish(&mut self, input: Value) -> io::Result<Value> {
        let request: Token = serde_json::from_value(input).map_err(io::Error::other)?;
        let plan = self.plans
            .remove(request.token.trim())
            .ok_or_else(|| invalid("stale history query"))?;
        self.bytes = self.bytes.saturating_sub(plan.bytes);
        Ok(json!({"finished":true}))
    }
}

#[inline]
fn directory(input: &Value) -> io::Result<PathBuf> {
    let path = PathBuf::from(
        input
            .get("objectsDirectory")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|val| !val.is_empty())
            .ok_or_else(|| invalid("history query objects directory"))?,
    );
    crate::merge_history::path(&path)?;
    Ok(path)
}

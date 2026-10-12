use super::{bfs, blame, diff, files, invalid, populate, sources::Cache};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashMap, io, path::PathBuf};

#[derive(Default)]
pub(crate) struct State {
    plans: HashMap<String, Plan>,
    sequence: u64,
    bytes: usize,
}
struct Plan {
    value: Value,
    directory: PathBuf,
    bytes: usize,
    sources: Cache,
}
#[derive(Deserialize)]
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
        let bytes = serde_json::to_vec(&plan).map_err(io::Error::other)?.len();
        if self.plans.len() >= 4096
            || bytes > 4 * 1024 * 1024 - 256
            || self.bytes
                + bytes
                + self.plans
                    .values()
                    .map(|plan| plan.sources.bytes)
                    .sum::<usize>()
                > 32 * 1024 * 1024
        {
            return Err(invalid("history query owner limit"));
        }
        let sequence =
            self.sequence.checked_add(1).ok_or_else(|| invalid("history query token overflow"))?;
        let token = crate::validate::hexadecimal(&Sha1::digest(sequence.to_be_bytes()));
        plan["token"] = json!(token);
        self.sequence = sequence;
        self.bytes += bytes;
        self.plans.insert(
            token,
            Plan { value: plan.clone(), directory, bytes, sources: Cache::default() },
        );
        Ok(plan)
    }
    pub(super) fn diff(&mut self, input: Value) -> io::Result<Value> {
        let request: diff::Request = serde_json::from_value(input).map_err(io::Error::other)?;
        self.verify_directory(&request.token, &request.objects_directory)?;
        let token = request.token.clone();
        diff::diff(request, self.sources(&token)?)
    }
    pub(super) fn blame(&mut self, input: Value) -> io::Result<Value> {
        let request: blame::Request = serde_json::from_value(input).map_err(io::Error::other)?;
        self.verify_directory(&request.token, &request.objects_directory)?;
        let token = request.token.clone();
        blame::blame(request, self.sources(&token)?)
    }
    fn sources(&mut self, token: &str) -> io::Result<&mut Cache> {
        let used: usize = self.plans
            .iter()
            .filter(|(key, _)| key.as_str() != token)
            .map(|(_, plan)| plan.sources.bytes)
            .sum();
        let plan = self.plans.get_mut(token).ok_or_else(|| invalid("stale history query"))?;
        plan.sources.limit = 32 * 1024 * 1024 - self.bytes - used;
        Ok(&mut plan.sources)
    }
    fn verify_directory(&self, token: &str, directory: &std::path::Path) -> io::Result<()> {
        let plan = self.plans.get(token).ok_or_else(|| invalid("stale history query"))?;
        if plan.directory != directory {
            return Err(invalid("history query directory mismatch"));
        }
        Ok(())
    }
    pub(super) fn files(&self, input: Value) -> io::Result<Value> {
        let request: files::Request = serde_json::from_value(input).map_err(io::Error::other)?;
        let plan = self.plans.get(&request.token).ok_or_else(|| invalid("stale history query"))?;
        files::lineage(request, &plan.value)
    }
    pub(super) fn finish(&mut self, input: Value) -> io::Result<Value> {
        let request: Token = serde_json::from_value(input).map_err(io::Error::other)?;
        let plan =
            self.plans.remove(&request.token).ok_or_else(|| invalid("stale history query"))?;
        self.bytes -= plan.bytes;
        Ok(json!({"finished":true}))
    }
}

fn directory(input: &Value) -> io::Result<PathBuf> {
    let path = PathBuf::from(
        input
            .get("objectsDirectory")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid("history query objects directory"))?,
    );
    crate::merge_history::path(&path)?;
    Ok(path)
}

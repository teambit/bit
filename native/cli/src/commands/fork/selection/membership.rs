//! `ForkByPattern` classifies the complete match list by membership, preserving duplicate matches.
#[cfg(test)]
mod tests;

use super::bare;
use serde_json::Value;

pub(super) fn classify(
    local: &[String],
    remote: &[String],
    pool: &[Value],
) -> (Vec<String>, Vec<String>) {
    let all = local.iter().chain(remote);
    let mut locals = Vec::new();
    let mut remotes = Vec::new();
    for id in all {
        if local.iter().any(|candidate| equal(id, candidate, pool)) {
            locals.push(bare(id).into());
        }
        if let Some(candidate) = remote.iter().find(|candidate| equal(id, candidate, pool)) {
            remotes.push(candidate.clone());
        }
    }
    // All forkMultipleFromRemote entries here lack env; its published comparator returns -1.
    remotes.reverse();
    (locals, remotes)
}
fn equal(left: &str, right: &str, pool: &[Value]) -> bool {
    bare(left) == bare(right) && version(left, pool) == version(right, pool)
}
fn version<'a>(id: &'a str, pool: &'a [Value]) -> Option<&'a str> {
    let explicit = id.split_once('@').map(|(_, version)| version);
    explicit
        .or_else(|| {
            pool.iter()
                .find(|row| row["identity"] == id)
                .and_then(|row| row["version"].as_str())
        })
        .filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"))
}

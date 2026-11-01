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
    let mut locals = Vec::with_capacity(local.len());
    let mut remotes = Vec::with_capacity(remote.len());
    for id in all {
        if local.iter().any(|candidate| equal(id, candidate, pool)) {
            locals.push(bare(id).into());
        }
        if let Some(candidate) = remote.iter().find(|candidate| equal(id, candidate, pool)) {
            remotes.push(candidate.trim().to_owned());
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
    let bare_id = bare(id);
    let explicit = id
        .trim()
        .rsplit_once('@')
        .map(|(_, version)| version.trim())
        .filter(|candidate| is_concrete_version(candidate));
    explicit.or_else(|| {
        let row = pool
            .iter()
            .find(|row| row_raw_id(row).map(bare) == Some(bare_id))?;
        row["version"]
            .as_str()
            .map(str::trim)
            .filter(|candidate| is_concrete_version(candidate))
            .or_else(|| {
                row_raw_id(row)
                    .and_then(|raw| raw.rsplit_once('@'))
                    .map(|(_, ver)| ver.trim())
                    .filter(|candidate| is_concrete_version(candidate))
            })
    })
}

fn row_raw_id(row: &Value) -> Option<&str> {
    row["identity"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .or_else(|| {
            row["id"]
                .as_str()
                .map(str::trim)
                .filter(|val| !val.is_empty())
        })
}

fn is_concrete_version(version: &str) -> bool {
    !version.is_empty()
        && !version.eq_ignore_ascii_case("latest")
        && !version.eq_ignore_ascii_case("head")
}

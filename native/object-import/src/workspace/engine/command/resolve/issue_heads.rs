use super::super::{invalid, repository::Repository};
use serde_json::{Value, json};
use std::io;

/// Issue callbacks inspect optional model/current-lane heads even when ordinary
/// snap metadata only needs the checked-out Version. Missing objects are a
/// proven absence, not permission to omit an existing issue-bearing Version.
pub(super) fn capture(context: &Value, repository: &mut Repository) -> io::Result<Value> {
    let mut output = Vec::new();
    for model in context["models"].as_array().ok_or_else(|| invalid("resolve issue models"))? {
        let identity = super::selection::identity(model)?;
        let lane_head = context["lane"]["targets"]
            .as_array()
            .and_then(|rows| {
                rows.iter()
                    .find(|row| row["identity"] == identity)
            })
            .and_then(|row| row["currentHead"].as_str());
        let mut heads = Vec::new();
        for hash in [model["head"].as_str(), lane_head].into_iter().flatten() {
            if heads
                .iter()
                .any(|head: &Value| head["hash"] == hash)
            {
                continue;
            }
            let version = match repository.read(hash, "Version") {
                Ok(version) => version,
                Err(error) if error.kind() == io::ErrorKind::NotFound => Value::Null,
                Err(error) => return Err(error),
            };
            heads.push(json!({"hash":hash,"version":version}));
        }
        output.push(json!({"identity":identity,"heads":heads}));
    }
    Ok(json!(output))
}

#[cfg(test)]
mod tests;

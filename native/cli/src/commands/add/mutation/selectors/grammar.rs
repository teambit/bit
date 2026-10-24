//! Preserve `ScopeMain`'s ordinary-then-state union and ordered AND syntax.
#[cfg(test)]
mod tests;

use crate::commands::patterns;
use serde_json::Value;
use std::io;

const STATES: [&str; 9] = [
    "new",
    "modified",
    "deprecated",
    "deleted",
    "internal",
    "snappedOnMain",
    "softTagged",
    "codeModified",
    "localOnly",
];

pub(super) fn validate(criterion: &str) -> io::Result<()> {
    let Some(state) = criterion.strip_prefix('$') else { return Ok(()) };
    if let Some((name, _)) = state.split_once(':') {
        if name == "env" {
            return Ok(());
        }
        return Err(io::Error::other(format!(
            "byMultiParamState expect the state to be one of the following: ['env'], got {name}",
        )));
    }
    if STATES.contains(&state) {
        return Ok(());
    }
    Err(io::Error::other(format!(
        "state {state} is not recognized, possible values: {}",
        STATES.join(", "),
    )))
}
pub(super) fn loads(criterion: &str) -> bool {
    matches!(criterion, "$modified" | "$deprecated" | "$deleted") || criterion.starts_with("$env:")
}
pub(super) fn identities(targets: &[Value]) -> Vec<String> {
    targets
        .iter()
        .filter_map(|row| row["identity"].as_str().map(str::to_owned))
        .collect()
}
pub(super) fn ordinary(targets: &[Value], parts: &[String]) -> io::Result<Vec<Value>> {
    let parts = parts
        .iter()
        .filter(|part| !part.starts_with('$') && !part.contains(" AND "))
        .cloned()
        .collect::<Vec<_>>();
    let ids = identities(targets);
    let ids = ids
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>();
    let matched = patterns::extended::matching(&ids, &parts)?;
    Ok(matched
        .iter()
        .filter_map(|id| {
            targets
                .iter()
                .find(|row| row["identity"] == *id)
        })
        .cloned()
        .collect())
}
pub(super) fn union(selected: &mut Vec<Value>, targets: Vec<Value>) {
    for row in targets {
        if !selected
            .iter()
            .any(|known| known["identity"] == row["identity"])
        {
            selected.push(row);
        }
    }
}
pub(super) fn no_matches(pattern: &str) -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidInput,
        format!(r#"unable to find any component matching the "{pattern}" pattern"#),
    )
}

pub(super) fn applied(entered: &str) -> String {
    if let Some(env) = entered.strip_prefix("$env:") {
        format!(
            "$env:{}",
            env.split(':')
                .next()
                .unwrap_or_default(),
        )
    } else {
        entered.into()
    }
}

//! Prove an existing history is complete before owning its no-change rebuild.
use super::{
    Chalk, Outcome, ScopeRoot, Value, emit_text, resolve_component_entry, scope_dir_for, sha1_hex,
};
use crate::commands::{remote_action::startup, workspace_command::format::Formatter};
use std::{
    collections::{HashMap, HashSet},
    ffi::OsString,
    fs, io,
};

#[cfg(test)]
mod tests;

pub(super) fn run(root: &ScopeRoot, args: &[OsString], id: &str) -> io::Result<Outcome> {
    let Some(identity) = prepare(root, id) else {
        return Ok(Outcome::Declined(
            "version-history rebuild requires a complete local graph".into(),
        ));
    };
    let chalk = Chalk::detect(args);
    let summary = Formatter::new(chalk).success_summary("completed building version history");
    let report = format!("{summary}\n{}: no changes", chalk.bold(&identity));
    emit_text(root, args, "build", true, report)
}

fn prepare(root: &ScopeRoot, id: &str) -> Option<String> {
    if id.is_empty()
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"/._-".contains(&byte))
    {
        return None;
    }
    let scope_dir = scope_dir_for(root);
    if !supported_startup(root, &scope_dir)? {
        return None;
    }
    let (scope, name, model_hash) = resolve_component_entry(&scope_dir, id)?;
    let scope = scope?;
    let (kind, model) = bit_object_import::read_scope_object(&scope_dir, &model_hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let head = model["head"].as_str()?;
    let hash = sha1_hex(&format!("{scope}/{name}:VersionHistory"));
    let (kind, history) = bit_object_import::read_scope_object(&scope_dir, &hash).ok()??;
    if kind != "VersionHistory" || !complete(&history, head)? {
        return None;
    }
    Some(format!("{scope}/{name}"))
}

fn supported_startup(root: &ScopeRoot, scope: &std::path::Path) -> Option<bool> {
    let workspace = (!root.bare).then_some(root.path.as_path());
    let config = match workspace {
        Some(path) => {
            bit_workspace_config::parse_jsonc(&fs::read(path.join("workspace.jsonc")).ok()?).ok()?
        }
        None => Value::Null,
    };
    startup::supported(workspace, scope, &config, true).ok()
}

fn complete(history: &Value, head: &str) -> Option<bool> {
    let rows = history["versions"].as_array()?;
    if rows.len() > 10000 {
        return None;
    }
    let by_hash = parent_index(rows)?;
    if history["graphCompleteRefs"]
        .as_array()
        .is_some_and(|refs| {
            refs.iter()
                .any(|value| value.as_str() == Some(head))
        })
    {
        return Some(true);
    }
    let mut visited = HashSet::new();
    let mut pending = vec![head];
    while let Some(hash) = pending.pop() {
        if !visited.insert(hash) {
            continue;
        }
        let Some(parents) = by_hash.get(hash) else { return Some(false) };
        for parent in *parents {
            pending.push(parent.as_str()?);
        }
    }
    Some(true)
}

fn parent_index(rows: &[Value]) -> Option<HashMap<&str, &Vec<Value>>> {
    let mut by_hash = HashMap::new();
    for row in rows {
        if by_hash
            .insert(row["hash"].as_str()?, row["parents"].as_array()?)
            .is_some()
        {
            return None;
        }
    }
    Some(by_hash)
}

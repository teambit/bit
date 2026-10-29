//! Render the bounded linear history without loading the JavaScript runtime.
use super::{
    Chalk, Outcome, ScopeRoot, Value, emit_text, resolve_component_entry, scope_dir_for, sha1_hex,
};
use std::{collections::HashSet, ffi::OsString, io};
mod refs;

pub(super) fn run(
    root: &ScopeRoot,
    args: &[OsString],
    id: &str,
    short: bool,
) -> io::Result<Outcome> {
    let Some(report) = prepare(root, id, short, Chalk::detect(args)) else {
        return Ok(Outcome::Declined("version-history text requires linear local history".into()));
    };
    emit_text(root, args, "show", true, report)
}

fn prepare(root: &ScopeRoot, id: &str, short: bool, chalk: Chalk) -> Option<String> {
    let scope_dir = scope_dir_for(root);
    let bare = id.rsplit_once('@').map_or(id, |(name, _)| name);
    let (scope, name, model_hash) = resolve_component_entry(&scope_dir, bare)?;
    let scope = scope?;
    let lane = refs::one_lane(&scope_dir, &scope, &name)?;
    let (kind, model) = bit_object_import::read_scope_object(&scope_dir, &model_hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let history_hash = sha1_hex(&format!("{scope}/{name}:VersionHistory"));
    let history = match bit_object_import::read_scope_object(&scope_dir, &history_hash).ok()? {
        Some((kind, value)) if kind == "VersionHistory" => value,
        None => return Some(String::new()),
        _ => return None,
    };
    render(&history, &model, short, chalk, lane.as_ref())
}

fn render(
    history: &Value,
    model: &Value,
    short: bool,
    chalk: Chalk,
    lane: Option<&(String, String)>,
) -> Option<String> {
    let rows = history["versions"].as_array()?;
    let mut previous: Option<&str> = None;
    let mut output = Vec::new();
    let mut identities = HashSet::new();
    for row in rows {
        let hash = validate_row(row, previous)?;
        if !identities.insert(if short { &hash[..9] } else { hash }) {
            return None;
        }
        output.push(format_row(model, hash, previous, short, chalk, lane)?);
        previous = Some(hash);
    }
    output.reverse();
    Some(output.join("\n"))
}

fn validate_row<'a>(row: &'a Value, previous: Option<&str>) -> Option<&'a str> {
    let hash = row["hash"].as_str()?;
    let parents = row["parents"].as_array()?;
    if hash.len() != 40
        || !hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        || parents.len() != usize::from(previous.is_some())
        || previous.is_some_and(|parent| parents[0].as_str() != Some(parent))
        || !row["unrelated"].is_null()
        || row["squashed"]
            .as_array()
            .is_some_and(|items| !items.is_empty())
    {
        return None;
    }
    Some(hash)
}

fn format_row(
    model: &Value,
    hash: &str,
    previous: Option<&str>,
    short: bool,
    chalk: Chalk,
    lane: Option<&(String, String)>,
) -> Option<String> {
    let mut pointers = Vec::new();
    if let Some((name, head)) = lane
        && head == hash
    {
        pointers.push(name.as_str());
    }
    if model["head"].as_str() == Some(hash) {
        pointers.push("main");
    }
    if let Some(tag) = tags(model, hash)? {
        pointers.push(tag);
    }
    let pointer = pointer_text(&pointers, chalk);
    let node = if short { &hash[..9] } else { hash };
    let edge = previous.map_or(String::new(), |parent| {
        format!("{} (parent)", if short { &parent[..9] } else { parent })
    });
    Some(format!("{}{pointer} {edge}", chalk.bold(node)))
}

fn pointer_text(pointers: &[&str], chalk: Chalk) -> String {
    if pointers.is_empty() {
        String::new()
    } else {
        format!(" ({})", chalk.cyan(&pointers.join(", ")))
    }
}

fn tags<'a>(model: &'a Value, hash: &str) -> Option<Option<&'a str>> {
    let mut found = None;
    for key in ["versions", "orphanedVersions"] {
        let Some(map) = model.get(key).and_then(Value::as_object) else { continue };
        for (tag, _) in map
            .iter()
            .filter(|(_, value)| value.as_str() == Some(hash))
        {
            if found.is_some() {
                return None;
            }
            found = Some(tag.as_str());
        }
    }
    Some(found)
}

#[cfg(test)]
mod tests;

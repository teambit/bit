//! `Repository.loadOptionallyCreateScopeIndex` after a repair removes its cached index.
//! Its published type filter is `ModelComponent` + `Lane`; `Symlink` entries are not rebuilt.
use super::{
    options::Options,
    plan::{Action, Plan},
};
use serde_json::{Value, json};
use std::{fs, io, path::Path};

pub(super) fn prepare(plan: &mut Plan, scope: &Path, options: &Options) -> io::Result<()> {
    // Pinned Repository.listRefs uses glob(path.join('*', '*')) plus path.sep
    // replacement. Its characterized Windows enumeration is empty, so rebuilding
    // finds no ModelComponents/Lanes and writes no index (also after --reset).
    if cfg!(windows) {
        return Ok(());
    }
    let cleared = options.resets.hard
        || options.resets.scope
        || options.resets.new
        || options.resets.lane_new;
    if cleared || !scope.join("objects").is_dir() {
        return Ok(());
    }
    if scope.join("index.json").exists() && !options.resets.repair {
        return Ok(());
    }
    let index = build(scope)?;
    if index["components"].as_array().is_none_or(Vec::is_empty)
        && index["lanes"].as_array().is_none_or(Vec::is_empty)
    {
        return Ok(());
    }
    plan.actions.push(Action::File(
        scope.join("index.json"),
        format!("{}\n", serde_json::to_string_pretty(&index)?).into_bytes(),
    ));
    Ok(())
}

fn build(scope: &Path) -> io::Result<Value> {
    let mut components = Vec::new();
    let mut lanes = Vec::new();
    for hash in hashes(&scope.join("objects"))? {
        let Some((kind, value)) = bit_object_import::read_scope_object(scope, &hash)? else {
            continue;
        };
        match kind.as_str() {
            "Component" => components.push(component(&value, &hash)?),
            "Lane" => lanes.push(lane(&value, &hash)?),
            _ => {}
        }
    }
    Ok(json!({"components":components,"lanes":lanes}))
}

fn hashes(objects: &Path) -> io::Result<Vec<String>> {
    let mut hashes = Vec::new();
    for directory in fs::read_dir(objects)? {
        let directory = directory?;
        if !directory.file_type()?.is_dir() {
            continue;
        }
        for entry in fs::read_dir(directory.path())? {
            let entry = entry?;
            let hash = format!(
                "{}{}",
                directory.file_name().to_string_lossy(),
                entry.file_name().to_string_lossy(),
            )
            .to_ascii_lowercase();
            if !entry.file_type()?.is_file()
                || hash.len() != 40
                || !hash.bytes().all(|byte| byte.is_ascii_hexdigit())
            {
                return Err(io::Error::other("init repository object inventory"));
            }
            hashes.push(hash);
        }
    }
    hashes.sort();
    Ok(hashes)
}

fn component(value: &Value, hash: &str) -> io::Result<Value> {
    let name = value["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| io::Error::other("init component name"))?;
    let scope = value["scope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty());
    Ok(json!({"id":{"scope":scope,"name":name},"isSymlink":false,"hash":hash}))
}

fn lane(value: &Value, hash: &str) -> io::Result<Value> {
    let name = value["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| io::Error::other("init lane name"))?;
    let mut id = json!({"name":name});
    if let Some(scope) = value.get("scope") {
        id["scope"] = scope
            .as_str()
            .map_or_else(|| scope.clone(), |text| json!(text.trim()));
    }
    Ok(json!({"id":id,"hash":hash}))
}

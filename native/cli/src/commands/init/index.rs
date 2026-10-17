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
    if index["components"]
        .as_array()
        .unwrap()
        .is_empty()
        && index["lanes"]
            .as_array()
            .unwrap()
            .is_empty()
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
    let mut index = json!({"components":[],"lanes":[]});
    for hash in hashes(&scope.join("objects"))? {
        let Some((kind, value)) = bit_object_import::read_scope_object(scope, &hash)? else {
            continue;
        };
        match kind.as_str() {
            "Component" => index["components"]
                .as_array_mut()
                .unwrap()
                .push(component(&value, &hash)?),
            "Lane" => index["lanes"]
                .as_array_mut()
                .unwrap()
                .push(lane(&value, &hash)?),
            _ => {}
        }
    }
    Ok(index)
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
            );
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
    let name = value["name"].as_str().ok_or_else(|| io::Error::other("init component name"))?;
    Ok(json!({"id":{"scope":value["scope"].as_str(),"name":name},"isSymlink":false,"hash":hash}))
}

fn lane(value: &Value, hash: &str) -> io::Result<Value> {
    let name = value["name"].as_str().ok_or_else(|| io::Error::other("init lane name"))?;
    let mut id = json!({"name":name});
    if let Some(scope) = value.get("scope") {
        id["scope"] = scope.clone();
    }
    Ok(json!({"id":id,"hash":hash}))
}

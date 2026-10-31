use crate::commands::{add::ProjectedLinker, workspace_command};
use bit_workspace_config::jsonc::Document;
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, Write},
    path::Path,
};
const RESOLVER: &str = "teambit.dependencies/dependency-resolver";
pub(super) fn persist(
    root: &Path,
    linker: &mut ProjectedLinker,
    facts: &[Value],
    old_packages: &[String],
    multiple: bool,
) -> io::Result<()> {
    let mut config = linker.call(root, "forkPolicyFacts", &json!({}))?;
    config["policy"] = build_policy(&config["policy"], facts, old_packages, multiple)?;
    write(root, &config, if multiple { "fork" } else { "fork (save deps)" })?;
    linker.call(root, "forkPolicyApplied", &json!({"config":config}))?;
    print!("{}", linker.take_stdout());
    Ok(())
}
fn build_policy(
    config: &Value,
    facts: &[Value],
    old_packages: &[String],
    multiple: bool,
) -> io::Result<Value> {
    let mut policy = config
        .as_object()
        .cloned()
        .unwrap_or_default();
    for field in ["dependencies", "peerDependencies"] {
        if !policy.get(field).is_some_and(Value::is_object) {
            policy.insert(field.into(), json!({}));
        }
    }
    for entry in dependencies(facts, old_packages, multiple)? {
        let id = entry["dependencyId"]
            .as_str()
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .ok_or_else(|| io::Error::other("fork dependency identity"))?;
        let is_peer = entry["lifecycleType"]
            .as_str()
            .is_some_and(|kind| kind.trim() == "peer");
        let field = if is_peer { "peerDependencies" } else { "dependencies" };
        policy
            .get_mut(field)
            .and_then(Value::as_object_mut)
            .ok_or_else(|| io::Error::other("fork root policy"))?
            .insert(id.into(), entry["value"]["version"].clone());
    }
    for value in policy.values_mut() {
        if let Some(entries) = value.as_object_mut() {
            entries.sort_keys();
        }
    }
    Ok(Value::Object(policy))
}
fn dependencies(
    facts: &[Value],
    old_packages: &[String],
    multiple: bool,
) -> io::Result<Vec<Value>> {
    let mut seen = Vec::new();
    let mut entries = Vec::new();
    for source in facts {
        for entry in bit_object_import::component_fork::dependency_policy(source)? {
            let id = entry["dependencyId"]
                .as_str()
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .ok_or_else(|| io::Error::other("fork dependency identity"))?;
            if multiple
                && (old_packages
                    .iter()
                    .any(|old| old.trim() == id)
                    || seen.iter().any(|old| old == id))
            {
                continue;
            }
            seen.push(id.to_owned());
            entries.push(entry);
        }
    }
    Ok(entries)
}
fn write(root: &Path, config: &Value, reason: &str) -> io::Result<()> {
    let path = root.join("workspace.jsonc");
    let before = fs::read(&path)?;
    let mut document = Document::parse(std::str::from_utf8(&before).map_err(io::Error::other)?)?;
    let resolver_key = crate::commands::update_cmd::aspect_entry(&document.value(), RESOLVER)
        .map_or_else(|| RESOLVER.to_owned(), |(key, _)| key.to_owned());
    for (key, value) in
        config.as_object().ok_or_else(|| io::Error::other("fork resolver config"))?
    {
        document.set(&[&resolver_key, key], value);
    }
    let text = format!("{document}\n");
    let text = if cfg!(windows) { text.replace('\n', "\r\n") } else { text };
    if fs::read(&path)? != before {
        return Err(io::Error::other("fork workspace configuration changed"));
    }
    let id = workspace_command::file_id();
    let history = bit_object_import::scope_path(root).join("workspace-config-history");
    fs::create_dir_all(history.join("files"))?;
    fs::write(history.join("files").join(&id), &before)?;
    writeln!(
        fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(history.join("metadata.txt"))?,
        "{id} {reason}",
    )?;
    fs::write(path, text)
}

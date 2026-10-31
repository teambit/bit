//! Remote fixtures remain independent of the pinned Windows pending-object glob bug.
use super::{Helper, config, setup};
use serde_json::Value;
use std::{collections::HashSet, ffi::OsStr, path::Path, process::Command};

pub(crate) fn publish(helper: &Helper) {
    if cfg!(windows) {
        seed_after_node_export(helper);
    } else {
        helper.run("export");
    }
}

/// Run the published local export lifecycle, then merge its canonical objects through the published remote writer.
/// Node's Windows server acknowledges no IDs because Repository.listRefs misses pending files;
/// its client still clears model state, synchronizes remote refs and marks the lane exported.
/// Complete only the fixture's bitmap/staged-config promotion omitted with that empty ID list.
pub(crate) fn seed_after_node_export(helper: &Helper) {
    node_export(helper);
    seed_after_export_at(helper, &helper.scopes.local_path);
}

/// Limit the fixture server to the components actually requested by this export.
pub(crate) fn publish_selected(helper: &Helper, identities: &[String]) {
    if cfg!(windows) {
        node_export(helper);
        seed_selected_at(helper, &helper.scopes.local_path, identities);
    } else {
        helper.run("export");
    }
}

/// Publish a cloned fixture author without changing the importing workspace.
pub(crate) fn publish_at(helper: &Helper, workspace: &Path) {
    node_export_at(workspace);
    if cfg!(windows) {
        seed_after_export_at(helper, workspace);
    }
}

/// Complete fixture publication after its caller has already executed the export lifecycle.
pub(crate) fn seed_after_export_at(helper: &Helper, workspace: &Path) {
    seed_selected_at(helper, workspace, &[]);
}
/// Publish fixture objects to an explicitly selected remote scope.
pub(crate) fn publish_to(helper: &Helper, remote: &Path) {
    node_export(helper);
    if cfg!(windows) {
        seed_selected_to(helper, &helper.scopes.local_path, remote, &[]);
    }
}
fn seed_selected_at(helper: &Helper, workspace: &Path, identities: &[String]) {
    seed_selected_to(helper, workspace, &helper.scopes.remote_path, identities);
}
fn seed_selected_to(helper: &Helper, workspace: &Path, remote: &Path, identities: &[String]) {
    let scope = bit_object_import::scope_path(workspace);
    promote_workspace(helper, &scope, workspace, identities);
    let shared = setup::shared();
    let output = Command::new("node")
        .arg(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/e2e/helper/publish_objects.js"))
        .arg(&shared.node_cli)
        .arg(&scope)
        .arg(remote)
        .arg(config::read_jsonc(&workspace.join(".bitmap"))["_bit_lane"]["id"].to_string())
        .arg(serde_json::to_string(identities).unwrap())
        .env("HOME", shared.root.join("home"))
        .env("USERPROFILE", shared.root.join("home"))
        .env("BIT_GLOBALS_DIR", shared.root.join("globals"))
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
}

pub(crate) fn node_export(helper: &Helper) {
    node_export_at(&helper.scopes.local_path);
}

fn node_export_at(workspace: &Path) {
    let exported = Helper::cmd_in_with(workspace, "export", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(exported.status.success(), "{} {}", exported.stdout, exported.stderr);
    let scope = bit_object_import::scope_path(workspace);
    assert!(!scope.join("staged-snaps").exists());
}

fn promote_workspace(helper: &Helper, scope: &Path, workspace: &Path, requested: &[String]) {
    let path = workspace.join(".bitmap");
    let mut bitmap = config::read_jsonc(&path);
    let mut identities = HashSet::new();
    for row in bitmap
        .as_object_mut()
        .unwrap()
        .values_mut()
        .filter(|row| row.get("rootDir").is_some())
    {
        let before = row.clone();
        let unversioned = row["version"].as_str().is_none_or(str::is_empty);
        if let Some(identity) = promote_row(row, &helper.scopes.remote, requested) {
            identities.insert(identity);
        }
        if unversioned {
            assert_eq!(*row, before, "publication changed unversioned bitmap row");
        }
    }
    let lane = &bitmap["_bit_lane"]["id"];
    let relative =
        if let (Some(scope), Some(name)) = (lane["scope"].as_str(), lane["name"].as_str()) {
            format!("{scope}/{name}.json")
        } else {
            "main.json".to_owned()
        };
    clear_staged_config(&scope.join("staged-config").join(relative), &identities);
    config::write_json(&path, &bitmap, b"    ");
}

fn promote_row(
    row: &mut Value,
    default_scope: &str,
    requested: &[String],
) -> Option<(String, String)> {
    if row["version"].as_str().is_none_or(str::is_empty) {
        return None;
    }
    let component_scope = row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .filter(|scope| !scope.is_empty())
        })
        .unwrap_or(default_scope)
        .to_owned();
    let name = row["name"].as_str().unwrap().to_owned();
    if !requested.is_empty() && !requested.contains(&format!("{component_scope}/{name}")) {
        return None;
    }
    if row["scope"].as_str().is_none_or(str::is_empty) {
        row["scope"] = Value::String(component_scope.clone());
        row.as_object_mut()
            .unwrap()
            .remove("defaultScope");
    }
    Some((component_scope, name))
}

fn clear_staged_config(path: &std::path::Path, identities: &HashSet<(String, String)>) {
    if !path.exists() {
        return;
    }
    let mut config = config::read_jsonc(path);
    config
        .as_array_mut()
        .unwrap()
        .retain(|row| {
            !identities.contains(&(
                row["id"]["scope"]
                    .as_str()
                    .unwrap()
                    .to_owned(),
                row["id"]["name"]
                    .as_str()
                    .unwrap()
                    .to_owned(),
            ))
        });
    config::write_json(path, &config, b"  ");
}

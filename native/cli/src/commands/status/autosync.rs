//! Independent native startup reconciliation for `workspace.bitmapAutoSync`.

use super::{
    Engine,
    js::{decline, text, without_version},
};
use bit_install::workspace::Bitmap;
use serde_json::{Value, json};
use std::{fmt::Write as _, fs, io, path::Path, process::Command};

#[derive(Default)]
pub(in crate::commands) struct Startup {
    pub(in crate::commands) committed: bool,
    pub(in crate::commands) stdout: String,
    pub(in crate::commands) build_stdout: String,
    pub(in crate::commands) build_progress: Option<Value>,
    pub(in crate::commands) snapshot_events: Vec<(Value, String)>,
    pub(in crate::commands) snapshot_tail: Option<Value>,
}

pub(in crate::commands) fn run_if_enabled(root: &Path) -> io::Result<()> {
    let config = bit_object_import::parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if !crate::commands::build_cmd::is_bitmap_auto_sync(&config) || !root.join(".git").exists() {
        return Ok(());
    }
    let mut engine = Engine::new()?;
    let mut startup = Startup::default();
    run(&mut engine, root, &mut startup)
}

pub(in crate::commands) fn run(
    engine: &mut Engine,
    root: &Path,
    startup: &mut Startup,
) -> io::Result<()> {
    let config = bit_object_import::parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    let Some((_, workspace)) =
        crate::commands::update_cmd::aspect_entry(&config, "teambit.workspace/workspace")
    else {
        return Ok(());
    };
    if workspace["bitmapAutoSync"] != true || !root.join(".git").exists() {
        return Ok(());
    }
    let bitmap = Bitmap::load(root, workspace["defaultScope"].as_str())?;
    if bitmap.lane
        .as_ref()
        .is_some_and(|lane| lane.name != "main")
    {
        return Ok(());
    }
    let sentinel = crate::workspace::scope_path(root).join("last-pull-sync");
    let previous = match fs::read_to_string(&sentinel) {
        Ok(value) => Some(value),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    let Some(head) = git_head(root) else {
        return Ok(());
    };
    if previous.as_deref().map(str::trim) == Some(&head) {
        return Ok(());
    }
    let ids = lookup_ids(&bitmap);
    synchronize(engine, root, startup, &head, &ids)
}

fn synchronize(
    engine: &mut Engine,
    root: &Path,
    startup: &mut Startup,
    head: &str,
    ids: &[String],
) -> io::Result<()> {
    if ids.is_empty() {
        startup.committed = true;
        let directory = crate::workspace::scope_path(root);
        fs::create_dir_all(&directory)?;
        return fs::write(directory.join("last-pull-sync"), head);
    }
    if presentation() {
        writeln!(
            &mut startup.stdout,
            "- importing {} components bitmapAutoSync: latest scope HEAD",
            ids.len(),
        )
        .map_err(io::Error::other)?;
    }
    let Ok(prepared) = crate::commands::import::prepare_status_refresh(engine, root, ids) else {
        return Ok(()); // Node logs a debug warning and retries on its next invocation.
    };
    let token = text(prepared.get("token"))?;
    startup.committed = true;
    let response: Value = engine.request(&json!({"kind":"commandAutoSyncFinalize","root":root,
        "token":token,"ids":ids.iter().map(|id|without_version(id)).collect::<Vec<_>>(),"gitHead":head,
        "bitmapHistoryFileId":crate::commands::workspace_command::file_id()}))?;
    let count = response["synced"].as_u64().ok_or_else(|| decline("auto-sync count"))?;
    if presentation() {
        progress(startup, ids.len(), &prepared, count)?;
    }
    Ok(())
}

fn git_head(root: &Path) -> Option<String> {
    if let Some(head) = git_dir_head(&root.join(".git")) {
        return Some(head);
    }
    let executable = crate::commands::diff::git::executable(root).ok()?;
    let output = Command::new(executable)
        .args(["rev-parse", "HEAD"])
        .current_dir(root)
        .output()
        .ok()?;
    output.status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .filter(|head| !head.is_empty())
}

fn git_dir_head(git: &Path) -> Option<String> {
    if !git.is_dir() {
        return None;
    }
    let head = fs::read_to_string(git.join("HEAD")).ok()?;
    let head = head.trim();
    if let Some(reference) = head.strip_prefix("ref:") {
        let reference = reference.trim();
        if reference.is_empty() {
            return None;
        }
        let value = fs::read_to_string(git.join(reference)).ok()?;
        let value = value.trim();
        (!value.is_empty()).then(|| value.to_owned())
    } else {
        (!head.is_empty()).then(|| head.to_owned())
    }
}

fn lookup_ids(bitmap: &Bitmap) -> Vec<String> {
    bitmap.entries
        .iter()
        .filter(|entry| entry.lanes.available_on_current_lane)
        .filter_map(|entry| {
            entry.id.scope
                .as_deref()
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
                .or_else(|| {
                    entry.id.default_scope
                        .as_deref()
                        .map(str::trim)
                        .filter(|scope| !scope.is_empty())
                })
                .map(|scope| {
                    let version = entry.id.version
                        .as_deref()
                        .map(str::trim)
                        .filter(|version| !version.is_empty())
                        .map_or_else(String::new, |version| format!("@{version}"));
                    format!("{scope}/{}{version}", entry.id.name.trim())
                })
        })
        .collect()
}

fn progress(startup: &mut Startup, ids: usize, prepared: &Value, synced: u64) -> io::Result<()> {
    let imported = prepared["refreshCount"]
        .as_u64()
        .unwrap_or(ids as u64);
    writeln!(
        &mut startup.stdout,
        "- successfully imported {imported} components bitmapAutoSync: latest scope HEAD",
    )
    .map_err(io::Error::other)?;
    writeln!(
        &mut startup.stdout,
        "- importing {ids} components bitmapAutoSync: dependencies for sync",
    )
    .map_err(io::Error::other)?;
    writeln!(
        &mut startup.stdout,
        "- successfully imported {imported} objects bitmapAutoSync: dependencies for sync",
    )
    .map_err(io::Error::other)?;
    if synced > 0 {
        writeln!(
            &mut startup.stdout,
            "  bitmapAutoSync: synced {synced} component(s) to scope HEAD",
        )
        .map_err(io::Error::other)?;
    }
    Ok(())
}

fn presentation() -> bool {
    !std::env::args().any(|argument| matches!(argument.as_str(), "--json" | "--json=true" | "-j"))
}

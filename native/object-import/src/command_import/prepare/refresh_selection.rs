//! Refresh main heads and optional parent closure before dependency transfer.
use super::{
    PreparedImport, Target, ancestors, identity, invalid, object_hash, read_model, receive, remote,
};
use crate::command_import::Progress;
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::Path};

pub(super) fn refresh_all<'a>(
    plan: &mut PreparedImport,
    scoped: &[&'a Target],
    remotes: &Value,
    ignore_missing: bool,
    all_history: bool,
) -> io::Result<Vec<&'a Target>> {
    if scoped.len() > 4096 {
        return Err(invalid("import refresh target limit"));
    }
    let mut directories = HashMap::new();
    let mut available = Vec::new();
    for target in scoped {
        let remote_name = target_scope(target)?;
        if remote_name == plan.environment.local_scope {
            available.push(*target);
            continue;
        }
        let directory = remote(plan, remotes, remote_name)?;
        directories.insert(remote_name.to_owned(), directory);
    }
    plan.progress.push(Progress {
        reason: Some("of their latest on main".into()),
        ..Default::default()
    });
    for target in scoped {
        let remote_name = target_scope(target)?;
        if remote_name == plan.environment.local_scope {
            continue;
        }
        let directory = &directories[remote_name];
        record_main_refresh(plan, directory, target, ignore_missing)?;
        record_request(plan, target, remote_name)?;
        if refresh_with_history(plan, target, directory, ignore_missing, all_history)? {
            available.push(*target);
        }
    }
    Ok(available)
}

fn target_scope(target: &Target) -> io::Result<&str> {
    target.scope
        .as_deref()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("import scope"))
}
fn record_main_refresh(
    plan: &mut PreparedImport,
    directory: &Path,
    target: &Target,
    status: bool,
) -> io::Result<()> {
    if status && let Some(model) = read_model(plan, directory, target)? {
        plan.main_refresh.observe(&model);
    }
    Ok(())
}

fn record_request(plan: &mut PreparedImport, target: &Target, scope: &str) -> io::Result<()> {
    let progress = plan.progress.last_mut().ok_or_else(|| invalid("import refresh progress"))?;
    progress.ids.push(identity(target)?);
    progress.objects.insert(object_hash(scope));
    Ok(())
}

fn refresh_with_history(
    plan: &mut PreparedImport,
    target: &Target,
    directory: &Path,
    ignore_missing: bool,
    all_history: bool,
) -> io::Result<bool> {
    let present = refresh(plan, target, directory, ignore_missing)?;
    if present && all_history {
        ancestors::collect(plan, directory, target)?;
    }
    Ok(present)
}

fn refresh(
    plan: &mut PreparedImport,
    target: &Target,
    directory: &Path,
    ignore_missing: bool,
) -> io::Result<bool> {
    let local = plan.environment.local_directory.clone();
    let scope = target_scope(target)?;
    let model = match read_model(plan, directory, target)? {
        Some(model) => model,
        None if ignore_missing => return Ok(false),
        None => return Err(invalid("import remote component missing")),
    };
    let Some(head) = model["head"]
        .as_str()
        .map(str::trim)
        .filter(|head| !head.is_empty())
    else {
        return Ok(!ignore_missing);
    };
    let path = remote_main_refs_path(&local, scope)?;
    let rows = match plan.overlay.remote_refs.get(scope).cloned() {
        Some(rows) => rows,
        None => plan.capture
            .json(&path)?
            .unwrap_or_else(|| json!([])),
    };
    let entries = rows.as_array().ok_or_else(|| invalid("import remote refs"))?;
    let stop = entries
        .iter()
        .find(|row| ref_row_matches(row, scope, target.name.trim()))
        .and_then(|row| row["head"].as_str().map(str::trim));
    if let Some(stop) = stop
        && read_model(plan, &local, target)?.is_some()
        && plan.capture.object(&local, stop, "Version")?.is_some()
        && stop == head
    {
        return Ok(true);
    }
    receive(plan, directory, target, &model, head, true)?;
    update_main_ref(plan, target, scope, head, rows)?;
    Ok(true)
}

fn remote_main_refs_path(local: &Path, scope: &str) -> io::Result<std::path::PathBuf> {
    Ok(local
        .parent()
        .ok_or_else(|| invalid("import scope directory"))?
        .join("refs/remotes")
        .join(scope)
        .join("main"))
}

fn update_main_ref(
    plan: &mut PreparedImport,
    target: &Target,
    scope: &str,
    head: &str,
    rows: Value,
) -> io::Result<()> {
    let name = target.name.trim();
    let rows = plan.overlay.remote_refs.entry(scope.to_owned()).or_insert(rows);
    let entries = rows.as_array_mut().ok_or_else(|| invalid("import refs rows"))?;
    if let Some(row) = entries.iter_mut().find(|row| ref_row_matches(row, scope, name)) {
        row["head"] = json!(head);
    } else {
        entries.push(json!({"id":{"scope":scope,"name":name},"head":head}));
    }
    Ok(())
}

fn ref_row_matches(row: &Value, scope: &str, name: &str) -> bool {
    let (scope, name) = (scope.trim(), name.trim());
    if let Some(raw) = row["id"].as_str().map(str::trim) {
        let bare = raw.rsplit_once('@').map_or(raw, |(prefix, _)| prefix.trim());
        return bare == name || bare == format!("{scope}/{name}");
    }
    let row_scope = row["id"]["scope"].as_str().map_or("", str::trim);
    row["id"]["name"].as_str().map(str::trim) == Some(name)
        && (row_scope.is_empty() || row_scope == scope)
}

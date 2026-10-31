//! Refresh main heads and optional parent closure before dependency transfer.
use super::{
    PreparedImport, Target, ancestors, identity, invalid, object_hash, read_model, refresh, remote,
};
use crate::command_import::Progress;
use serde_json::Value;
use std::{collections::HashMap, io, path::Path};

pub(super) fn refresh_all<'a>(
    plan: &mut PreparedImport,
    scoped: &[&'a Target],
    remotes: &Value,
    ignore_missing: bool,
    all_history: bool,
) -> io::Result<Vec<&'a Target>> {
    let mut directories = HashMap::new();
    let mut available = Vec::new();
    for target in scoped {
        let remote_name = target.scope
            .as_deref()
            .map(str::trim)
            .filter(|scope| !scope.is_empty())
            .ok_or_else(|| invalid("import scope"))?;
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
        let remote_name = target.scope
            .as_deref()
            .map(str::trim)
            .filter(|scope| !scope.is_empty())
            .ok_or_else(|| invalid("import scope"))?;
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

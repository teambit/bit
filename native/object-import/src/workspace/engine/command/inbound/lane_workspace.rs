//! Import visible current-lane heads and main-only selections in one retained transfer.
mod objects;

use super::{Prepare, Target, config, identity, invalid, lanes, remote};
use crate::command_import::{self, PreparedImport, Progress, VirtualRemote, lane};
use std::{collections::HashMap, io};

pub(super) fn prepare(
    input: &Prepare,
    roots: &[Target],
    id: &lane::Id,
) -> io::Result<(Vec<Target>, PreparedImport)> {
    if input.options.objects_only {
        return objects::prepare(input, roots, id);
    }
    if input.options.dependencies.import_dependencies
        || input.options.dependencies.import_head_dependencies
    {
        return Err(invalid("inbound lane workspace import mode"));
    }
    match remote::lane_objects(input, id)? {
        Some((remote, hash)) => prepare_http(input, roots, id, remote, &hash),
        None => prepare_file(input, roots, id),
    }
}

fn prepare_file(
    input: &Prepare,
    roots: &[Target],
    id: &lane::Id,
) -> io::Result<(Vec<Target>, PreparedImport)> {
    let mut import = command_import::prepare_lane(&input.root, &input.global_remotes_file)?;
    let record = import.fetch_lane_workspace_at_hash(id, None, !input.options.all_history)?;
    let choice = choose(input, roots, lane::entries(&record.value)?)?;
    import.retain_remote_lane_refs(&record)?;
    finish(import, choice, id, input)
}

fn prepare_http(
    input: &Prepare,
    roots: &[Target],
    id: &lane::Id,
    remote_lane: VirtualRemote,
    hash: &str,
) -> io::Result<(Vec<Target>, PreparedImport)> {
    let choice = choose(input, roots, remote::lane_entries(&remote_lane, hash, id)?)?;
    let main_targets = choice.selected
        .iter()
        .filter(|target| {
            target.scope
                .as_deref()
                .is_some_and(|scope| choice.main.contains(&format!("{scope}/{}", target.name)))
        })
        .cloned()
        .collect::<Vec<_>>();
    let mut remotes = HashMap::new();
    lanes::merge_remote(&mut remotes, remote_lane)?;
    for remote in remote::objects(input, &main_targets)? {
        lanes::merge_remote(&mut remotes, remote)?;
    }
    lanes::validate_virtual_bounds(&remotes)?;
    let remotes = remotes.into_values().collect::<Vec<_>>();
    let mut import = command_import::prepare_lane_with_virtual(
        &input.root,
        &input.global_remotes_file,
        &remotes,
    )?;
    let record = import.fetch_lane_workspace_at_hash(id, Some(hash), !input.options.all_history)?;
    import.retain_remote_lane_refs(&record)?;
    finish(import, choice, id, input)
}

struct Choice {
    selected: Vec<Target>,
    main: Vec<String>,
    changed: usize,
}

fn choose(input: &Prepare, roots: &[Target], entries: Vec<lane::Entry>) -> io::Result<Choice> {
    let visible = entries
        .into_iter()
        .filter(|entry| !entry.hidden)
        .map(|entry| (entry.identity.trim().to_owned(), entry.head.trim().to_owned()))
        .collect::<HashMap<_, _>>();
    let bitmap = config::document(&input.root.join(".bitmap"))?;
    let (selected, main, changed) = select(input, roots, &visible, &bitmap)?;
    Ok(Choice { selected, main, changed })
}

fn finish(
    mut import: PreparedImport,
    choice: Choice,
    id: &lane::Id,
    input: &Prepare,
) -> io::Result<(Vec<Target>, PreparedImport)> {
    if !choice.main.is_empty() {
        import.refresh_lane_main(&choice.main)?;
    }
    if input.options.dependencies.fetch_deps {
        import.prepare_lane_dependencies(&input.root, &choice.selected)?;
        if !choice.main.is_empty() {
            import.mark_post_write_bitmap_history();
        }
    }
    progress(
        &mut import,
        &choice.selected,
        &choice.main,
        id,
        choice.changed,
        input.options.dependencies.fetch_deps,
    )?;
    Ok((choice.selected, import))
}

fn select(
    input: &Prepare,
    roots: &[Target],
    visible: &HashMap<String, String>,
    bitmap: &serde_json::Value,
) -> io::Result<(Vec<Target>, Vec<String>, usize)> {
    let mut selected = Vec::new();
    let mut main_targets = Vec::new();
    let mut main = Vec::new();
    let mut changed = 0;
    for root in roots {
        let mut target = root.clone();
        let scope = root.scope.as_deref().ok_or_else(|| invalid("inbound lane target scope"))?;
        let key = format!("{scope}/{}", root.name);
        if let Some(head) = visible_lane_head(visible, &key, &target.version) {
            let head_changed = check_head_update(input, bitmap, &target.name, head)?;
            changed += usize::from(head_changed);
            target.version.clone_from(head);
            selected.push(target);
        } else {
            if input.ids
                .iter()
                .any(|id| id.contains('@'))
                && target.version.len() == 40
                && target.version.bytes().all(|b| b.is_ascii_hexdigit())
            {
                return Err(invalid(
                    "inbound explicit version on lane requires canonical history check",
                ));
            }
            main.push(key);
            main_targets.push(target);
        }
    }
    selected.extend(main_targets);
    Ok((selected, main, changed))
}

fn visible_lane_head<'a>(
    visible: &'a HashMap<String, String>,
    key: &str,
    version: &str,
) -> Option<&'a String> {
    let version = version.trim();
    visible
        .get(key.trim())
        .filter(|head| version == "latest" || version == head.trim())
}

fn check_head_update(
    input: &Prepare,
    bitmap: &serde_json::Value,
    name: &str,
    head: &str,
) -> io::Result<bool> {
    let head = head.trim();
    let head_changed = bitmap
        .get(name)
        .is_some_and(|row| row["version"].as_str().map(str::trim) != Some(head));
    if head_changed
        && !input.options.resolution.override_existing
        && input.options.resolution.merge_strategy.is_none()
    {
        return Err(invalid("inbound lane head update needs canonical conflict handling"));
    }
    Ok(head_changed)
}

fn progress(
    import: &mut PreparedImport,
    selected: &[Target],
    main: &[String],
    id: &lane::Id,
    changed: usize,
    fetch_deps: bool,
) -> io::Result<()> {
    let lane_count = import.progress
        .first()
        .map_or(0, |row| row.components.len())
        .max(changed);
    let main_count = import.progress.get(1).map_or(0, |row| row.components.len())
        * usize::from(!main.is_empty());
    let latest = latest_row(selected, id, lane_count + main_count)?;
    let missing = missing_row(selected, main, id, lane_count, fetch_deps)?;
    import.progress = vec![latest, missing];
    Ok(())
}

fn latest_row(selected: &[Target], id: &lane::Id, count: usize) -> io::Result<Progress> {
    let mut latest = Progress {
        reason: Some(format!("of their latest on lane {}/{}", id.scope, id.name)),
        ids: selected
            .iter()
            .map(identity)
            .collect::<io::Result<Vec<_>>>()?,
        ..Default::default()
    };
    for target in selected.iter().take(count) {
        latest.components.insert(identity(target)?);
    }
    latest.objects.insert(id.scope.clone());
    Ok(latest)
}

fn missing_row(
    selected: &[Target],
    main: &[String],
    id: &lane::Id,
    lane_count: usize,
    fetch_deps: bool,
) -> io::Result<Progress> {
    let mut missing_ids = main
        .iter()
        .map(|name| format!("{name}@latest"))
        .collect::<Vec<_>>();
    missing_ids.extend(
        selected
            .iter()
            .filter(|target| {
                target.scope
                    .as_deref()
                    .is_some_and(|scope| !main.contains(&format!("{scope}/{}", target.name)))
            })
            .take(lane_count)
            .map(identity)
            .collect::<io::Result<Vec<_>>>()?,
    );
    let mut missing = Progress {
        reason: Some(
            if fetch_deps {
                "for getting all dependencies"
            } else {
                "for getting missing versions and dependencies"
            }
            .into(),
        ),
        ids: missing_ids,
        ..Default::default()
    };
    missing.objects.extend(
        main.iter()
            .filter_map(|name| name.split_once('/').map(|(scope, _)| scope.to_owned())),
    );
    if lane_count > 0 {
        missing.objects.insert(id.scope.clone());
    }
    Ok(missing)
}

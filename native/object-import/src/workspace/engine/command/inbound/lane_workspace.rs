//! Import visible current-lane heads and main-only selections in one retained transfer.
use super::{Prepare, Target, config, identity, invalid, remote};
use crate::command_import::{self, PreparedImport, Progress, lane};
use std::{collections::HashMap, io};

pub(super) fn prepare(
    input: &Prepare,
    roots: &[Target],
    id: &lane::Id,
) -> io::Result<(Vec<Target>, PreparedImport)> {
    if input.options.objects_only
        || input.options.dependencies.import_dependencies
        || input.options.dependencies.import_head_dependencies
    {
        return Err(invalid("inbound lane workspace import mode"));
    }
    let (mut import, record) = open_lane(input, id)?;
    let visible = lane::entries(&record.value)?
        .into_iter()
        .filter(|entry| !entry.hidden)
        .map(|entry| (entry.identity, entry.head))
        .collect::<HashMap<_, _>>();
    let bitmap = config::document(&input.root.join(".bitmap"))?;
    let (selected, main, changed) = select(input, roots, &visible, &bitmap)?;
    if !main.is_empty() {
        import.refresh_lane_main(&main)?;
    }
    progress(&mut import, &selected, &main, id, changed)?;
    Ok((selected, import))
}

fn open_lane(input: &Prepare, id: &lane::Id) -> io::Result<(PreparedImport, lane::Record)> {
    let fetched = remote::lane_objects(input, id)?;
    let (mut import, hash) = if let Some((remote, hash)) = fetched {
        (
            command_import::prepare_lane_with_virtual(
                &input.root,
                &input.global_remotes_file,
                &[remote],
            )?,
            Some(hash),
        )
    } else {
        (command_import::prepare_lane(&input.root, &input.global_remotes_file)?, None)
    };
    let record = import.fetch_lane_contents_at_hash(id, hash.as_deref())?;
    import.retain_remote_lane_refs(&record)?;
    Ok((import, record))
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
        if let Some(head) = visible.get(&key)
            && (target.version == "latest" || target.version == *head)
        {
            let head_changed = bitmap
                .get(&target.name)
                .is_some_and(|row| row["version"] != *head);
            if head_changed
                && !input.options.resolution.override_existing
                && input.options.resolution.merge_strategy.is_none()
            {
                return Err(invalid("inbound lane head update needs canonical conflict handling"));
            }
            changed += usize::from(head_changed);
            target.version.clone_from(head);
            selected.push(target);
        } else {
            main.push(key);
            main_targets.push(target);
        }
    }
    selected.extend(main_targets);
    Ok((selected, main, changed))
}

fn progress(
    import: &mut PreparedImport,
    selected: &[Target],
    main: &[String],
    id: &lane::Id,
    changed: usize,
) -> io::Result<()> {
    let lane_count = import.progress
        .first()
        .map_or(0, |row| row.components.len())
        .max(changed);
    let main_count = import.progress.last().map_or(0, |row| row.components.len())
        * usize::from(!main.is_empty());
    let latest = latest_row(selected, id, lane_count + main_count)?;
    let missing = missing_row(selected, main, id, lane_count)?;
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
        reason: Some("for getting missing versions and dependencies".into()),
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

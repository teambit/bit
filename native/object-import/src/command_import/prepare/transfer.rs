use super::{
    PreparedImport, Target, history, identity, invalid, merge, object_hash, read_model,
    read_version,
};
use serde_json::{Value, json};
use std::{io, path::Path};
pub(super) fn receive(
    plan: &mut PreparedImport,
    directory: &Path,
    target: &Target,
    incoming: &Value,
    hash: &str,
    include_history: bool,
) -> io::Result<()> {
    receive_from(plan, directory, target, incoming, hash, include_history, true)
}

/// Lane transfers retain history but only their origin scope can refresh the main head.
pub(super) fn receive_lane(
    plan: &mut PreparedImport,
    directory: &Path,
    source: &str,
    target: &Target,
    incoming: &Value,
    hash: &str,
) -> io::Result<()> {
    receive_from(
        plan,
        directory,
        target,
        incoming,
        hash,
        true,
        target.scope.as_deref() == Some(source),
    )
}

/// `receive` of a model that arrived from `directory` as a cached dependency
/// of a component of another scope (`mergeOne` with `isIncomingFromOrigin`
/// false): no remote head is recorded for it.
pub(super) fn receive_dependency(
    plan: &mut PreparedImport,
    directory: &Path,
    target: &Target,
    incoming: &Value,
    hash: &str,
) -> io::Result<()> {
    receive_from(plan, directory, target, incoming, hash, false, false)
}

fn receive_from(
    plan: &mut PreparedImport,
    directory: &Path,
    target: &Target,
    incoming: &Value,
    hash: &str,
    include_history: bool,
    origin: bool,
) -> io::Result<()> {
    let row = plan.progress.last_mut().ok_or_else(|| invalid("import progress phase"))?;
    row.components.insert(identity(target)?);
    row.objects.insert(hash.to_owned());
    let record = plan.capture
        .object(directory, hash, "Version")?
        .ok_or_else(|| invalid("import remote Version missing"))?;
    let version = record.value.as_ref().ok_or_else(|| invalid("import Version metadata"))?;
    crate::history_query::validate_version(version)?;
    let scope = plan.cache.lane_sources
        .get(&identity(target)?)
        .cloned()
        .or_else(|| target.scope.clone());
    receive_sources(plan, directory, version)
        .map_err(|error| super::super::remote_error::mark(scope.as_deref(), error))?;
    let old = read_version(plan, hash)?;
    let newer = old
        .as_ref()
        .map(|old| {
            crate::operation::plan(
                json!({"kind":"version","existing":date(old)?,"incoming":date(version)?}),
            )
        })
        .transpose()?
        .is_some_and(|value| value == true);
    if !newer {
        plan.overlay.objects.insert(hash.to_owned(), record);
    }
    if include_history {
        receive_history(plan, directory, incoming, hash)?;
    }
    merge_model(plan, target, incoming, origin)?;
    if origin {
        record_remote_head(plan, target, incoming)?;
    }
    Ok(())
}

/// `ObjectFetcher` always rewrites each merged Component using the canonical serializer.
/// Equal heads can avoid fetching Sources, but do not make the mutable model immutable.
pub(super) fn merge_model(
    plan: &mut PreparedImport,
    target: &Target,
    incoming: &Value,
    origin: bool,
) -> io::Result<()> {
    let local = plan.environment.local_directory.clone();
    let old = read_model(plan, &local, target)?;
    let value = merge::model_from(old.as_ref(), incoming, origin)?;
    let hash = object_hash(&identity(target)?);
    plan.overlay.objects.insert(
        hash.clone(),
        super::super::publish::object(&hash, "Component", value)?,
    );
    update_index(plan, target, &hash)?;
    Ok(())
}
fn receive_history(
    plan: &mut PreparedImport,
    directory: &Path,
    incoming: &Value,
    hash: &str,
) -> io::Result<()> {
    let local = plan.environment.local_directory.clone();
    let (hash, incoming_history, changed) =
        history::populate(&mut plan.capture, directory, incoming, hash)?;
    if changed {
        plan.writes.remote_objects.push((
            directory.to_owned(),
            hash.clone(),
            incoming_history.clone(),
        ));
    }
    plan.progress
        .last_mut()
        .unwrap()
        .objects
        .insert(hash.clone());
    let old = if let Some(retained) = plan.overlay.objects.get(&hash) {
        Some(retained.clone())
    } else {
        plan.capture.object(&local, &hash, "VersionHistory")?
    };
    let merged = history::merge(old.as_ref(), &incoming_history)?;
    let object = if !changed && merged == incoming_history {
        plan.capture
            .object(directory, &hash, "VersionHistory")?
            .ok_or_else(|| invalid("import remote VersionHistory missing"))?
    } else {
        super::super::publish::object(&hash, "VersionHistory", merged)?
    };
    plan.overlay.objects.insert(hash, object);
    Ok(())
}
pub(super) fn receive_sources(
    plan: &mut PreparedImport,
    directory: &Path,
    version: &Value,
) -> io::Result<()> {
    retain_sources(plan, directory, version, true)
}
pub(super) fn retain_sources(
    plan: &mut PreparedImport,
    directory: &Path,
    version: &Value,
    transferred: bool,
) -> io::Result<()> {
    let mut sources = Vec::new();
    for file in version["files"].as_array().ok_or_else(|| invalid("import files"))? {
        sources.push(
            file["file"]
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("import file reference"))?
                .to_owned(),
        );
    }
    for key in ["flattenedEdgesRef", "dependenciesGraphRef", "flattenedDependenciesRef"] {
        if let Some(hash) = version[key]
            .as_str()
            .map(str::trim)
            .filter(|hash| !hash.is_empty())
        {
            sources.push(hash.to_owned());
        }
    }
    // The wire stream queues sources again on later fetches even when our retained
    // overlay can reuse their validated bytes. Count the phase's unique queue entries.
    if transferred {
        plan.progress
            .last_mut()
            .ok_or_else(|| invalid("import progress phase"))?
            .objects
            .extend(sources.iter().cloned());
    }
    sources.retain(|hash| !plan.overlay.objects.contains_key(hash));
    for (hash, source) in plan.capture.sources(directory, &sources)? {
        plan.overlay.objects.insert(hash, source);
    }
    Ok(())
}
pub(super) fn record_remote_head(
    plan: &mut PreparedImport,
    target: &Target,
    incoming: &Value,
) -> io::Result<()> {
    let Some(head) = incoming["head"]
        .as_str()
        .map(str::trim)
        .filter(|head| !head.is_empty())
    else {
        return Ok(());
    };
    let scope = target.scope
        .as_deref()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("import remote ref scope"))?;
    ensure_remote_refs(plan, scope)?;
    let rows = plan.overlay.remote_refs
        .get_mut(scope)
        .and_then(Value::as_array_mut)
        .ok_or_else(|| invalid("import remote refs"))?;
    if let Some(row) = rows
        .iter_mut()
        .find(|row| {
            crate::workspace::engine::command::inbound::remote::file_list::row_lane_matches(
                row,
                scope,
                &target.name,
            )
        })
    {
        row["head"] = json!(head);
    } else {
        rows.push(json!({"id":{"scope":scope,"name":target.name},"head":head}));
    }
    Ok(())
}
fn ensure_remote_refs(plan: &mut PreparedImport, scope: &str) -> io::Result<()> {
    if !plan.overlay.remote_refs.contains_key(scope) {
        let path = plan.environment.local_directory
            .parent()
            .ok_or_else(|| invalid("import scope directory"))?
            .join("refs/remotes")
            .join(scope)
            .join("main");
        let rows = plan.capture
            .json(&path)?
            .unwrap_or_else(|| json!([]));
        plan.overlay.remote_refs.insert(scope.to_owned(), rows);
    }
    Ok(())
}
pub(super) fn date(version: &Value) -> io::Result<&str> {
    version["modified"]
        .as_array()
        .and_then(|rows| rows.last())
        .map_or(&version["log"]["date"], |row| &row["date"])
        .as_str()
        .ok_or_else(|| invalid("import Version date"))
}
pub(super) fn update_index(
    plan: &mut PreparedImport,
    target: &Target,
    hash: &str,
) -> io::Result<()> {
    let rows = if plan.writes.index.is_array() {
        &mut plan.writes.index
    } else {
        &mut plan.writes.index["components"]
    };
    let rows = rows.as_array_mut().ok_or_else(|| invalid("import index components"))?;
    if rows
        .iter()
        .any(|row| row["hash"] == hash)
    {
        return Ok(());
    }
    plan.writes.index_changed = true;
    rows.push(
        json!({"id":{"scope":target.scope,"name":target.name},"isSymlink":false,"hash":hash}),
    );
    Ok(())
}

/// Cache-enabled importWithoutDeps may ask the origin for an unbuilt local snap
/// that was never exported. The origin omits that component from its stream;
/// preserve the retained local Version and do not merge remote model metadata.
pub(super) fn receive_cached(
    plan: &mut PreparedImport,
    directory: &Path,
    target: &Target,
    incoming: &Value,
    hash: &str,
) -> io::Result<()> {
    if plan.capture.object(directory, hash, "Version")?.is_some() {
        return receive(plan, directory, target, incoming, hash, false);
    }
    let local = read_version(plan, hash)?
        .ok_or_else(|| invalid("import requested Version absent locally and remotely"))?;
    crate::history_query::validate_version(&local)
}

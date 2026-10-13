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
    let local = plan.environment.local_directory.clone();
    let row = plan.progress.last_mut().ok_or_else(|| invalid("import progress phase"))?;
    row.components.insert(identity(target)?);
    row.objects.insert(hash.to_owned());
    let record = plan.capture
        .object(directory, hash, "Version")?
        .ok_or_else(|| invalid("import remote Version missing"))?;
    let version = record.value.as_ref().ok_or_else(|| invalid("import Version metadata"))?;
    crate::history_query::validate_version(version)?;
    receive_sources(plan, directory, version)?;
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
    let old = read_model(plan, &local, target)?;
    let value = merge::model(old.as_ref(), incoming)?;
    let hash = object_hash(&identity(target)?);
    plan.overlay.objects.insert(
        hash.clone(),
        super::super::publish::object(&hash, "Component", value)?,
    );
    update_index(plan, target, &hash)?;
    record_remote_head(plan, target, incoming)?;
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
    let old = plan.capture.object(&local, &hash, "VersionHistory")?;
    let merged = history::merge(old.as_ref(), &incoming_history)?;
    plan.overlay.objects.insert(
        hash.clone(),
        super::super::publish::object(&hash, "VersionHistory", merged)?,
    );
    Ok(())
}
fn receive_sources(plan: &mut PreparedImport, directory: &Path, version: &Value) -> io::Result<()> {
    let mut sources = Vec::new();
    for file in version["files"].as_array().ok_or_else(|| invalid("import files"))? {
        sources.push(
            file["file"]
                .as_str()
                .ok_or_else(|| invalid("import file reference"))?
                .to_owned(),
        );
    }
    for key in ["flattenedEdgesRef", "dependenciesGraphRef"] {
        if let Some(hash) = version[key].as_str() {
            sources.push(hash.to_owned());
        }
    }
    sources.retain(|hash| !plan.overlay.objects.contains_key(hash));
    for (hash, source) in plan.capture.sources(directory, &sources)? {
        plan.progress
            .last_mut()
            .unwrap()
            .objects
            .insert(hash.clone());
        plan.overlay.objects.insert(hash, source);
    }
    Ok(())
}
pub(super) fn record_remote_head(
    plan: &mut PreparedImport,
    target: &Target,
    incoming: &Value,
) -> io::Result<()> {
    let Some(head) = incoming["head"].as_str() else {
        return Ok(());
    };
    let scope = target.scope.as_deref().ok_or_else(|| invalid("import remote ref scope"))?;
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
    let rows = plan.overlay.remote_refs
        .get_mut(scope)
        .and_then(Value::as_array_mut)
        .ok_or_else(|| invalid("import remote refs"))?;
    if let Some(row) = rows
        .iter_mut()
        .find(|row| row["id"]["scope"] == scope && row["id"]["name"] == target.name)
    {
        row["head"] = json!(head);
    } else {
        rows.push(json!({"id":{"scope":scope,"name":target.name},"head":head}));
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

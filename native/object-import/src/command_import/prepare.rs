use super::{Capture, Overlay, PreparedImport, Target, history, invalid, merge, object_hash};
use dependencies::{closure, only_unbuilt_requests};
use remote::remote;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::Path,
};
use transfer::receive;
mod dependencies;
mod lane;
mod remote;
mod selected;
mod transfer;
pub(crate) fn prepare(
    root: &Path,
    global_remotes_file: &Path,
    targets: &[Target],
) -> io::Result<PreparedImport> {
    prepare_with_virtual(root, global_remotes_file, targets, &[])
}

pub(crate) struct VirtualRemote {
    pub(crate) scope: String,
    pub(crate) path: std::path::PathBuf,
    pub(crate) objects: Vec<(String, Vec<u8>)>,
}

pub(crate) fn prepare_with_virtual(
    root: &Path,
    global_remotes_file: &Path,
    targets: &[Target],
    virtual_remotes: &[VirtualRemote],
) -> io::Result<PreparedImport> {
    prepare_with_virtual_options(root, global_remotes_file, targets, virtual_remotes, false)
}

/// `status --lanes` ignores a component that has never been exported to main.
pub(crate) fn prepare_status_with_virtual(
    root: &Path,
    global_remotes_file: &Path,
    targets: &[Target],
    virtual_remotes: &[VirtualRemote],
) -> io::Result<PreparedImport> {
    prepare_with_virtual_options(root, global_remotes_file, targets, virtual_remotes, true)
}

fn prepare_with_virtual_options(
    root: &Path,
    global_remotes_file: &Path,
    targets: &[Target],
    virtual_remotes: &[VirtualRemote],
    ignore_missing: bool,
) -> io::Result<PreparedImport> {
    if !root.is_absolute() || !global_remotes_file.is_absolute() || targets.len() > 4096 {
        return Err(invalid("import command bounds"));
    }
    let (mut plan, scope) = empty(root, false)?;
    for remote in virtual_remotes {
        plan.virtual_remote(&remote.scope, remote.path.clone(), &remote.objects)?;
    }
    let scoped: Vec<_> = targets
        .iter()
        .filter(|target| target.scope.is_some())
        .collect();
    plan.bitmap_count = scoped.len();
    if scoped.is_empty() {
        return Ok(plan);
    }
    let global = plan.capture.json(global_remotes_file)?;
    if global.is_none() {
        plan.environment.global_remotes = Some(global_remotes_file.to_owned());
    }
    let mut remotes = global.unwrap_or_else(|| json!({}));
    let remotes_map = remotes.as_object_mut().ok_or_else(|| invalid("import global remotes"))?;
    if let Some(local) = scope["remotes"].as_object() {
        remotes_map.extend(local.clone());
    }
    plan.environment.remotes = remotes.clone();
    let available = refresh_all(&mut plan, &scoped, &remotes, ignore_missing)?;
    prepare_dependencies(&mut plan, root, &available, &remotes)?;
    plan.validate()?;
    Ok(plan)
}
fn prepare_dependencies(
    plan: &mut PreparedImport,
    root: &Path,
    scoped: &[&Target],
    remotes: &Value,
) -> io::Result<()> {
    let staged = plan.capture
        .read(&crate::scope_path(root).join("staged-snaps"))?
        .unwrap_or_default();
    let staged = std::str::from_utf8(&staged).map_err(io::Error::other)?;
    staged.clone_into(&mut plan.cache.staged);
    let name = plan.environment.local_scope.clone();
    plan.cache.only_if_built = only_unbuilt_requests(plan, scoped, &name, staged)?;
    plan.progress.push(super::Progress {
        reason: Some("for getting missing versions and dependencies".into()),
        ..Default::default()
    });
    let mut visited = HashSet::new();
    for target in scoped {
        closure(plan, target, &name, staged, remotes, &mut visited)?;
    }
    Ok(())
}
fn refresh_all<'a>(
    plan: &mut PreparedImport,
    scoped: &[&'a Target],
    remotes: &Value,
    ignore_missing: bool,
) -> io::Result<Vec<&'a Target>> {
    let mut directories = HashMap::new();
    let mut available = Vec::new();
    for target in scoped {
        let remote_name = target.scope.as_deref().ok_or_else(|| invalid("import scope"))?;
        if remote_name == plan.environment.local_scope {
            available.push(*target);
            continue;
        }
        let directory = remote(plan, remotes, remote_name)?;
        directories.insert(remote_name.to_owned(), directory);
    }
    plan.progress.push(super::Progress {
        reason: Some("of their latest on main".into()),
        ..Default::default()
    });
    for target in scoped {
        let remote_name = target.scope.as_deref().ok_or_else(|| invalid("import scope"))?;
        if remote_name == plan.environment.local_scope {
            continue;
        }
        let directory = &directories[remote_name];
        record_main_refresh(plan, directory, target, ignore_missing)?;
        plan.progress
            .last_mut()
            .unwrap()
            .ids
            .push(identity(target)?);
        plan.progress
            .last_mut()
            .unwrap()
            .objects
            .insert(object_hash(remote_name));
        if refresh(plan, target, directory, ignore_missing)? {
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
fn empty(root: &Path, allow_lane: bool) -> io::Result<(PreparedImport, Value)> {
    let mut capture = Capture::default();
    let scope = capture
        .json(&crate::scope_path(root).join("scope.json"))?
        .ok_or_else(|| invalid("import local scope"))?;
    remote::settings_for_lane(&scope, allow_lane)?;
    let name = scope["name"].as_str().ok_or_else(|| invalid("import local name"))?;
    let index = capture
        .json(&crate::scope_path(root).join("index.json"))?
        .unwrap_or_else(|| json!({"components":[],"lanes":[]}));
    let plan = PreparedImport {
        overlay: Overlay::default(),
        progress: Vec::new(),
        bitmap_count: 0,
        main_refresh: super::MainRefresh::default(),
        capture,
        environment: super::Environment {
            local_directory: crate::scope_path(root).join("objects"),
            remote_overrides: HashMap::new(),
            global_remotes: None,
            missing_global_remotes: None,
            remotes: json!({}),
            local_scope: name.to_owned(),
        },
        cache: super::Cache::default(),
        writes: super::Writes {
            remote_objects: Vec::new(),
            index,
            index_changed: false,
            lane_histories: Vec::new(),
            switch_tracking: None,
        },
    };
    Ok((plan, scope))
}
/// Main merge only consults persisted remote heads. Its later common-snap fetch
/// must share an import owner without executing checkout's current-head refresh.
pub(crate) fn prepare_cached(
    root: &Path,
    global_remotes_file: &Path,
) -> io::Result<PreparedImport> {
    let mut plan = prepare(root, global_remotes_file, &[])?;
    configure_cached(&mut plan, root, global_remotes_file)?;
    Ok(plan)
}
pub(crate) fn prepare_lane(root: &Path, global_remotes_file: &Path) -> io::Result<PreparedImport> {
    if !root.is_absolute() || !global_remotes_file.is_absolute() {
        return Err(invalid("lane import absolute paths"));
    }
    let (mut plan, _) = empty(root, true)?;
    configure_cached(&mut plan, root, global_remotes_file)?;
    Ok(plan)
}
pub(crate) fn prepare_lane_with_virtual(
    root: &Path,
    global_remotes_file: &Path,
    remotes: &[VirtualRemote],
) -> io::Result<PreparedImport> {
    let mut plan = prepare_lane(root, global_remotes_file)?;
    for remote in remotes {
        plan.virtual_remote(&remote.scope, remote.path.clone(), &remote.objects)?;
    }
    plan.validate()?;
    Ok(plan)
}
fn configure_cached(
    plan: &mut PreparedImport,
    root: &Path,
    global_remotes_file: &Path,
) -> io::Result<()> {
    let scope = plan.capture
        .json(&crate::scope_path(root).join("scope.json"))?
        .ok_or_else(|| invalid("import local scope"))?;
    let global = plan.capture.json(global_remotes_file)?;
    if global.is_none() {
        plan.environment.missing_global_remotes = Some(global_remotes_file.to_owned());
    }
    let mut remotes = global.unwrap_or_else(|| json!({}));
    let map = remotes.as_object_mut().ok_or_else(|| invalid("import global remotes"))?;
    if let Some(local) = scope["remotes"].as_object() {
        map.extend(local.clone());
    }
    plan.environment.remotes = remotes;
    let staged = plan.capture
        .read(&crate::scope_path(root).join("staged-snaps"))?
        .unwrap_or_default();
    plan.cache.staged = String::from_utf8(staged).map_err(io::Error::other)?;
    plan.validate()?;
    Ok(())
}
fn identity(target: &Target) -> io::Result<String> {
    let scope = target.scope.as_deref().ok_or_else(|| invalid("import unscoped target"))?;
    if target.name.is_empty() || target.name.len() > 4096 {
        return Err(invalid("import target name"));
    }
    Ok(format!("{scope}/{}", target.name))
}
fn read_model(
    plan: &mut PreparedImport,
    directory: &Path,
    target: &Target,
) -> io::Result<Option<Value>> {
    let hash = object_hash(&identity(target)?);
    if directory == plan.environment.local_directory
        && let Some(value) = plan.overlay.read(&hash, "Component")?
    {
        return Ok(Some(value.clone()));
    }
    let value = plan.capture.object(directory, &hash, "Component")?.and_then(|record| record.value);
    if value
        .as_ref()
        .is_some_and(|value| {
            value["name"] != target.name
                || value["scope"].as_str() != target.scope.as_deref()
        })
    {
        return Err(invalid("import model identity"));
    }
    Ok(value)
}
fn refresh(
    plan: &mut PreparedImport,
    target: &Target,
    directory: &Path,
    ignore_missing: bool,
) -> io::Result<bool> {
    let local = plan.environment.local_directory.clone();
    let scope = target.scope.as_deref().ok_or_else(|| invalid("import scope"))?;
    let model = match read_model(plan, directory, target)? {
        Some(model) => model,
        None if ignore_missing => return Ok(false),
        None => return Err(invalid("import remote component missing")),
    };
    let Some(head) = model["head"].as_str() else { return Ok(!ignore_missing) };
    let path = local
        .parent()
        .ok_or_else(|| invalid("import scope directory"))?
        .join("refs/remotes")
        .join(scope)
        .join("main");
    let rows = plan.capture
        .json(&path)?
        .unwrap_or_else(|| json!([]));
    let entries = rows.as_array().ok_or_else(|| invalid("import remote refs"))?;
    let stop = entries
        .iter()
        .find(|row| row["id"]["scope"] == scope && row["id"]["name"] == target.name)
        .and_then(|row| row["head"].as_str());
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
fn update_main_ref(
    plan: &mut PreparedImport,
    target: &Target,
    scope: &str,
    head: &str,
    rows: Value,
) -> io::Result<()> {
    let rows = plan.overlay.remote_refs.entry(scope.to_owned()).or_insert(rows);
    let entries = rows.as_array_mut().ok_or_else(|| invalid("import refs rows"))?;
    if let Some(row) = entries
        .iter_mut()
        .find(|row| row["id"]["scope"] == scope && row["id"]["name"] == target.name)
    {
        row["head"] = json!(head);
    } else {
        entries.push(json!({"id":{"scope":scope,"name":target.name},"head":head}));
    }
    Ok(())
}
fn version_ref(model: &Value, version: &str) -> io::Result<String> {
    if crate::merge_history::hash(version).is_ok() {
        return Ok(version.to_owned());
    }
    if version.is_empty() || version == "latest" {
        return model["head"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| invalid("import model head absent"));
    }
    model["orphanedVersions"]
        .get(version)
        .unwrap_or_else(|| &model["versions"][version])
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| invalid("import model version absent"))
}
fn read_version(plan: &mut PreparedImport, hash: &str) -> io::Result<Option<Value>> {
    if let Some(value) = plan.overlay.read(hash, "Version")? {
        return Ok(Some(value.clone()));
    }
    Ok(plan.capture
        .object(&plan.environment.local_directory, hash, "Version")?
        .and_then(|record| record.value))
}

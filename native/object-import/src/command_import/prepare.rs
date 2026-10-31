pub(super) mod options;

mod ancestors;
mod checkout;
mod dependencies;
mod forced;
mod graph;
mod lane;
mod policy;
mod recovery;
mod refresh_selection;
mod remote;
mod selected;
mod transfer;

use super::{Capture, Overlay, PreparedImport, Target, history, invalid, merge, object_hash};
use dependencies::{closure, only_unbuilt_requests};
use refresh_selection::refresh_all;
use remote::remote;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::Path,
};
use transfer::receive;
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
    prepare_with_virtual_options(
        root,
        global_remotes_file,
        targets,
        virtual_remotes,
        Mode::default(),
    )
}

/// `status --lanes` ignores a component that has never been exported to main.
pub(crate) fn prepare_status_with_virtual(
    root: &Path,
    global_remotes_file: &Path,
    targets: &[Target],
    virtual_remotes: &[VirtualRemote],
) -> io::Result<PreparedImport> {
    prepare_with_virtual_options(
        root,
        global_remotes_file,
        targets,
        virtual_remotes,
        Mode { ignore_missing: true, ..Mode::default() },
    )
}

#[derive(Default, Clone, Copy)]
struct Mode {
    ignore_missing: bool,
    all_history: bool,
    fetch_dependencies: bool,
    graph_versions: bool,
}

fn prepare_with_virtual_options(
    root: &Path,
    global_remotes_file: &Path,
    targets: &[Target],
    virtual_remotes: &[VirtualRemote],
    mode: Mode,
) -> io::Result<PreparedImport> {
    if !root.is_absolute() || !global_remotes_file.is_absolute() || targets.len() > 4096 {
        return Err(invalid("import command bounds"));
    }
    let (mut plan, scope) = empty(root, false)?;
    plan.cache.fetch_all_dependencies = mode.fetch_dependencies;
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
    let available =
        refresh_all(&mut plan, &scoped, &remotes, mode.ignore_missing, mode.all_history)?;
    if mode.graph_versions {
        plan.prime_versionless_graph_ids(&available)?;
    }
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
    plan.cache.only_if_built =
        !plan.cache.fetch_all_dependencies && only_unbuilt_requests(plan, scoped, &name, staged)?;
    plan.progress.push(super::Progress {
        reason: Some(
            if plan.cache.fetch_all_dependencies {
                "for getting all dependencies"
            } else {
                "for getting missing versions and dependencies"
            }
            .into(),
        ),
        ..Default::default()
    });
    let mut visited = HashSet::new();
    for target in scoped {
        closure(plan, target, &name, staged, remotes, &mut visited)?;
    }
    if plan.cache.fetch_all_dependencies {
        forced::finish(plan, scoped)?;
    }
    Ok(())
}
fn empty(root: &Path, allow_lane: bool) -> io::Result<(PreparedImport, Value)> {
    empty_at(&crate::scope_path(root), allow_lane)
}
fn empty_at(directory: &Path, allow_lane: bool) -> io::Result<(PreparedImport, Value)> {
    let mut capture = Capture::default();
    let scope = capture
        .json(&directory.join("scope.json"))?
        .ok_or_else(|| invalid("import local scope"))?;
    remote::settings_for_lane(&scope, allow_lane)?;
    let name = scope["name"].as_str().ok_or_else(|| invalid("import local name"))?;
    let index = capture
        .json(&directory.join("index.json"))?
        .unwrap_or_else(|| json!({"components":[],"lanes":[]}));
    let plan = PreparedImport {
        overlay: Overlay::default(),
        progress: Vec::new(),
        bitmap_count: 0,
        main_refresh: super::MainRefresh::default(),
        capture,
        environment: super::Environment {
            local_directory: directory.join("objects"),
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
            post_write_bitmap_history: false,
            switch_warning: None,
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
    prepare_lane_at(&crate::scope_path(root), global_remotes_file)
}
pub(crate) fn prepare_lane_at(
    directory: &Path,
    global_remotes_file: &Path,
) -> io::Result<PreparedImport> {
    if !directory.is_absolute() || !global_remotes_file.is_absolute() {
        return Err(invalid("lane import absolute paths"));
    }
    let (mut plan, _) = empty_at(directory, true)?;
    configure_cached_at(&mut plan, directory, global_remotes_file)?;
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
    configure_cached_at(plan, &crate::scope_path(root), global_remotes_file)
}
fn configure_cached_at(
    plan: &mut PreparedImport,
    directory: &Path,
    global_remotes_file: &Path,
) -> io::Result<()> {
    let scope = plan.capture
        .json(&directory.join("scope.json"))?
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
        .read(&directory.join("staged-snaps"))?
        .unwrap_or_default();
    plan.cache.staged = String::from_utf8(staged).map_err(io::Error::other)?;
    plan.validate()?;
    Ok(())
}
fn identity(target: &Target) -> io::Result<String> {
    let scope = target.scope
        .as_deref()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("import unscoped target"))?;
    if target.name.trim().is_empty() || target.name.len() > 4096 {
        return Err(invalid("import target name"));
    }
    Ok(format!("{scope}/{}", target.name.trim()))
}
fn read_model(
    plan: &mut PreparedImport,
    directory: &Path,
    target: &Target,
) -> io::Result<Option<Value>> {
    let scoped_hash = object_hash(&identity(target)?);
    let is_local = directory == plan.environment.local_directory;
    if is_local && let Some(value) = plan.overlay.read(&scoped_hash, "Component")? {
        return Ok(Some(value.clone()));
    }
    let mut value =
        plan.capture.object(directory, &scoped_hash, "Component")?.and_then(|record| record.value);
    if value.is_none() && is_local {
        let unscoped_hash = object_hash(&target.name);
        if let Some(overlay_val) = plan.overlay.read(&unscoped_hash, "Component")? {
            return Ok(Some(overlay_val.clone()));
        }
        value = plan.capture
            .object(directory, &unscoped_hash, "Component")?
            .and_then(|record| record.value);
    }
    if value
        .as_ref()
        .is_some_and(|val| {
            let val_scope = val["scope"]
                .as_str()
                .filter(|scope| !scope.is_empty());
            val["name"] != target.name
                || (val_scope != target.scope.as_deref() && !(is_local && val_scope.is_none()))
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
        .find(|row| ref_row_matches(row, scope, &target.name))
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
    if let Some(row) = entries.iter_mut().find(|row| ref_row_matches(row, scope, &target.name)) {
        row["head"] = json!(head);
    } else {
        entries.push(json!({"id":{"scope":scope,"name":target.name},"head":head}));
    }
    Ok(())
}
fn ref_row_matches(row: &Value, scope: &str, name: &str) -> bool {
    if let Some(raw) = row["id"].as_str() {
        let bare = raw.rsplit_once('@').map_or(raw, |(prefix, _)| prefix);
        return bare == name || bare == format!("{scope}/{name}");
    }
    let row_scope = row["id"]["scope"].as_str().unwrap_or_default();
    row["id"]["name"] == name && (row_scope.is_empty() || row_scope == scope)
}
fn version_ref(model: &Value, version: &str) -> io::Result<String> {
    let version = version.trim();
    if crate::merge_history::hash(version).is_ok() {
        return Ok(version.to_owned());
    }
    if version.is_empty() || matches!(version, "latest" | "head") {
        return model["head"]
            .as_str()
            .map(str::trim)
            .filter(|head| !head.is_empty())
            .map(str::to_owned)
            .ok_or_else(|| invalid("import model head absent"));
    }
    model["orphanedVersions"]
        .get(version)
        .unwrap_or_else(|| &model["versions"][version])
        .as_str()
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
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

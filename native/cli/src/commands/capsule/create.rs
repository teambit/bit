//! Native `bit capsule create [component-ids...] [--seeders-only] [-j|--json]`.

pub(super) use self::root::parse_create_flags;

mod files;
mod metadata;
mod root;

use super::{
    super::{
        aspect::workspace_default_scope, dependents::find_existing_bitmap_entry,
        scope_set::selection,
    },
    Chalk, Formatter, ScopeRoot, emit_report, outside,
};
use crate::{commands::workspace_command::uuid_v4, history::History, native::Outcome};
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, VecDeque},
    ffi::OsString,
    fs,
    io::{self, Write},
    path::{Component, Path},
    process::ExitCode,
};

use self::{
    files::{
        ManifestConfig, component_dependency, copy_component_files, supported_builtin_manifests,
        write_default_package_json,
    },
    metadata::write_root_metadata,
    root::resolve_create_root,
};

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(in crate::commands) struct CreateArgs {
    pub ids: Vec<String>,
    pub seeders_only: bool,
    pub json: bool,
    pub base_dir: Option<String>,
    pub always_new: bool,
    pub name: Option<String>,
    pub root_base_dir: Option<String>,
    pub use_hash: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CreatedCapsule {
    id: String,
    path: String,
}

enum BuildError {
    BeforeWrite,
    AfterWrite(io::Error),
}

pub(super) fn run_create(
    cwd: &Path,
    root: &ScopeRoot,
    args: &[OsString],
    chalk: Chalk,
    create_args: &CreateArgs,
) -> io::Result<Outcome> {
    if root.bare {
        return outside::run_create_in_bare_scope(chalk, args, create_args);
    }
    let capsules = match build_capsules(cwd, root, create_args) {
        Ok(capsules) => capsules,
        Err(BuildError::BeforeWrite) => {
            return Ok(Outcome::Declined("capsule create delegated".into()));
        }
        Err(BuildError::AfterWrite(err)) => return Err(err),
    };
    if create_args.json {
        emit_create_json(root, args, &capsules)
    } else {
        let data = format_create_report(&capsules, chalk);
        emit_report(root, args, "create", data)
    }
}

fn emit_create_json(
    root: &ScopeRoot,
    args: &[OsString],
    capsules: &[CreatedCapsule],
) -> io::Result<Outcome> {
    let history = History::start(&root.path, args);
    let rows = capsules
        .iter()
        .map(|cap| json!({ "id": cap.id, "path": cap.path }))
        .collect::<Vec<_>>();
    let payload = json!(rows);
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(&payload)?.as_bytes())?;
    stdout.flush()?;
    history.end(true);
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn format_create_report(capsules: &[CreatedCapsule], chalk: Chalk) -> String {
    let formatter = Formatter::new(chalk);
    let mut lines =
        vec![formatter.success_summary(&format!("{} capsule(s) were created", capsules.len()))];
    for cap in capsules {
        lines.push(formatter.item(&format!("{} - {}", chalk.bold(&cap.id), cap.path)));
    }
    lines.join("\n")
}

fn build_capsules(
    cwd: &Path,
    root: &ScopeRoot,
    create_args: &CreateArgs,
) -> Result<Vec<CreatedCapsule>, BuildError> {
    let ws_capsules_dir =
        resolve_create_root(cwd, root, create_args).map_err(|_| BuildError::BeforeWrite)?;
    let bitmap = load_workspace_bitmap(&root.path).map_err(|_| BuildError::BeforeWrite)?;
    let active = bitmap.entries
        .iter()
        .filter(|entry| entry.owns_its_dir())
        .collect::<Vec<_>>();
    let seeders = resolve_seeder_indices(&bitmap, &active, &create_args.ids)
        .map_err(|_| BuildError::BeforeWrite)?;
    let edges = build_dependency_edges(&root.path, &active);
    let selected =
        select_isolated_indices(active.len(), &seeders, &edges, create_args.seeders_only);
    validate_custom_name(create_args.name.as_deref(), selected.len(), create_args.always_new)
        .map_err(|_| BuildError::BeforeWrite)?;
    let Some(envs) = supported_builtin_manifests(&root.path, &active, &selected)
        .map_err(|_| BuildError::BeforeWrite)?
    else {
        return Err(BuildError::BeforeWrite);
    };
    write_root_metadata(&ws_capsules_dir, create_args.base_dir.as_deref().unwrap_or(""))
        .map_err(BuildError::AfterWrite)?;
    selected
        .into_iter()
        .zip(envs)
        .map(|(idx, manifest)| {
            let dependencies = edges[idx]
                .iter()
                .map(|&dep| component_dependency(active[dep]))
                .collect::<BTreeMap<_, _>>();
            materialize_capsule(
                &root.path,
                &ws_capsules_dir,
                active[idx],
                &manifest,
                create_args,
                &dependencies,
            )
        })
        .collect::<io::Result<_>>()
        .map_err(BuildError::AfterWrite)
}

fn validate_custom_name(
    name: Option<&str>,
    selected_len: usize,
    always_new: bool,
) -> io::Result<()> {
    let Some(name) = name else { return Ok(()) };
    if selected_len != 1 && !always_new {
        return Err(io::Error::other("capsule id requires one selected component"));
    }
    let mut components = Path::new(name).components();
    if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
        return Err(io::Error::other("unsupported capsule id"));
    }
    Ok(())
}

fn load_workspace_bitmap(ws_root: &Path) -> io::Result<Bitmap> {
    let ws_bytes = fs::read(ws_root.join("workspace.jsonc"))?;
    let ws_val: Value = bit_object_import::parse_jsonc(&ws_bytes).map_err(io::Error::other)?;
    let default_scope =
        workspace_default_scope(&ws_val).map_err(|err| io::Error::other(format!("{err:?}")))?;
    Bitmap::load(ws_root, Some(&default_scope))
}

fn resolve_seeder_indices(
    bitmap: &Bitmap,
    active: &[&BitmapEntry],
    raw_ids: &[String],
) -> io::Result<Vec<usize>> {
    if raw_ids.is_empty() {
        return Ok((0..active.len()).collect());
    }
    let mut indices = Vec::new();
    for raw_id in raw_ids {
        let entry = find_existing_bitmap_entry(bitmap, raw_id)
            .ok_or_else(|| io::Error::other(format!("component {raw_id} not in bitmap")))?;
        let idx = active
            .iter()
            .position(|cand| cand.key == entry.key)
            .ok_or_else(|| io::Error::other("inactive component"))?;
        if !indices.contains(&idx) {
            indices.push(idx);
        }
    }
    Ok(indices)
}

fn build_dependency_edges(ws_root: &Path, active: &[&BitmapEntry]) -> Vec<Vec<usize>> {
    active
        .iter()
        .enumerate()
        .map(|(from_idx, entry)| {
            let source_blob = collect_component_sources(&ws_root.join(&entry.root_dir));
            outgoing_edges(from_idx, &source_blob, active)
        })
        .collect()
}

fn outgoing_edges(from_idx: usize, source_blob: &str, active: &[&BitmapEntry]) -> Vec<usize> {
    active
        .iter()
        .enumerate()
        .filter(|(to_idx, target)| {
            *to_idx != from_idx && references_component(source_blob, &target.id.name)
        })
        .map(|(to_idx, _)| to_idx)
        .collect()
}

fn references_component(source_blob: &str, comp_name: &str) -> bool {
    ['/', '.']
        .into_iter()
        .any(|prefix| {
            ['\'', '"']
                .into_iter()
                .any(|quote| source_blob.contains(&format!("{prefix}{comp_name}{quote}")))
        })
}

fn collect_component_sources(comp_dir: &Path) -> String {
    let Ok(entries) = fs::read_dir(comp_dir) else {
        return String::new();
    };
    let mut combined = String::new();
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        let name = entry.file_name();
        if name == "node_modules" || name == ".git" {
            continue;
        }
        if path.is_dir() {
            combined.push_str(&collect_component_sources(&path));
        } else if let Ok(content) = fs::read_to_string(&path) {
            combined.push_str(&content);
            combined.push('\n');
        }
    }
    combined
}

fn select_isolated_indices(
    total: usize,
    seeders: &[usize],
    edges: &[Vec<usize>],
    seeders_only: bool,
) -> Vec<usize> {
    let mut selected = seeders.to_vec();
    for cand in 0..total {
        if !selected.contains(&cand) && should_isolate_candidate(cand, seeders, edges, seeders_only)
        {
            selected.push(cand);
        }
    }
    selected
}

fn should_isolate_candidate(
    cand: usize,
    seeders: &[usize],
    edges: &[Vec<usize>],
    seeders_only: bool,
) -> bool {
    seeders
        .iter()
        .any(|&seeder| {
            let forward = can_reach(edges, seeder, cand);
            if seeders_only { forward && can_reach(edges, cand, seeder) } else { forward }
        })
}

fn can_reach(edges: &[Vec<usize>], start: usize, target: usize) -> bool {
    let mut visited = vec![false; edges.len()];
    let mut queue = VecDeque::from([start]);
    visited[start] = true;
    while let Some(curr) = queue.pop_front() {
        if curr == target {
            return true;
        }
        enqueue_unvisited(&edges[curr], &mut visited, &mut queue);
    }
    false
}

fn enqueue_unvisited(neighbors: &[usize], visited: &mut [bool], queue: &mut VecDeque<usize>) {
    for &next in neighbors {
        if !visited[next] {
            visited[next] = true;
            queue.push_back(next);
        }
    }
}

fn materialize_capsule(
    ws_root: &Path,
    capsules_root: &Path,
    entry: &BitmapEntry,
    manifest: &ManifestConfig,
    create_args: &CreateArgs,
    dependencies: &BTreeMap<String, String>,
) -> io::Result<CreatedCapsule> {
    let full_id = selection::entry_full_id(entry);
    let mut dir_name = create_args.name
        .clone()
        .unwrap_or_else(|| full_id.replace('/', "_"));
    if create_args.always_new {
        dir_name.push('_');
        dir_name.push_str(&uuid_v4()?);
    }
    let capsule_dir = capsules_root.join(dir_name);
    fs::create_dir_all(&capsule_dir)?;
    let src_dir = ws_root.join(&entry.root_dir);
    if src_dir.is_dir() && entry.root_dir != "." {
        copy_component_files(&src_dir, &capsule_dir)?;
    }
    write_default_package_json(&capsule_dir, entry, manifest, dependencies)?;
    fs::write(capsule_dir.join(".bit-capsule-ready"), "")?;
    Ok(CreatedCapsule { id: full_id, path: capsule_dir.to_string_lossy().into_owned() })
}

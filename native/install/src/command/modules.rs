//! `_installModules`: link, calculate manifests, run the engine, link the
//! components, compile, and repeat while legacy envs keep changing the manifests.

pub(super) mod linking;

mod compile_stamp;
mod engine_run;

use super::{
    calculate::{Calculated, calculate, calculate_linked, workspace_aspects},
    packages, restore,
    session::{Loaded, Session},
    workspace_jsonc,
};
use crate::{
    AfterInstall, config::DEPENDENCY_RESOLVER_ASPECT, engine, manifests::manifests_hash,
    model::DependencyMap, output::Style,
};
use serde_json::{Value, json};
use std::{collections::HashSet, fs, io, path::Path, time::Instant};

const MAX_CYCLES: usize = 5;

/// What the installation did, for the summary.
pub struct Installed {
    pub components: usize,
    pub old_non_loaded_envs: Vec<String>,
}

/// Install the workspace dependencies.
pub async fn install(session: &Session<'_>, mut loaded: Loaded) -> io::Result<Installed> {
    if let Some(allow_scripts) = &session.options.allow_scripts {
        persist_allow_scripts(session, &loaded, allow_scripts)?;
        loaded = Loaded::load(session)?;
    }
    let output = &session.output;
    let manager = output.paint(Style::Cyan, "teambit.dependencies/pnpm");
    output.console(&format!("installing dependencies in workspace using pnpm ({manager})"));
    let classes_loaded =
        session.host.initial_installation_components(&workspace_aspects(session, &loaded)).await?;
    let initial_components =
        super::session::installation_components::initial(session, &loaded, classes_loaded).await?;
    let links = linking::root_links(session, &loaded, &initial_components)?;
    let mut calculated = calculate_linked(session, &loaded, &links).await?;
    if session.options.add_missing_deps
        && add_missing_deps(session, &loaded, &calculated, &links).await?
    {
        loaded = Loaded::load(session)?;
        calculated = calculate(session, &loaded, &links).await?;
    }
    print_manifest_messages(session, &calculated);
    let has_root_components = loaded.config.dependency_resolver.has_root_components();
    let restore = restore::input(session, has_root_components, &calculated)?;
    prepare_directories(&loaded, &calculated)?;
    // `_installModulesProfiled` loads the component directory map before the engine runs.
    calculated.engine_components =
        super::session::installation_components::load(session, &loaded, "engine").await?;
    let context = CycleContext { loaded: &loaded, links: &links, restore: restore.as_ref() };
    let old_non_loaded_envs = run_cycles(session, &context, &mut calculated).await?;
    linking::sync_core_aspects(session, &loaded, &calculated.engine_components)?;
    if !session.options.lockfile_only && !session.options.skip_prune {
        // A failed prune never fails the installation. Directories the host
        // process loaded modules from stay (`loadedVirtualStoreDirNames`).
        let loaded_dirs: HashSet<String> = session.info
            .loaded_virtual_store_dirs
            .iter()
            .cloned()
            .collect();
        let _ = engine::prune_modules(&session.root, &loaded_dirs);
    }
    Ok(Installed { components: calculated.components.len(), old_non_loaded_envs })
}

/// The engine runs; another round only for `--recurring-install` while legacy envs
/// that failed to load before the installation change the manifests.
async fn run_cycles(
    session: &Session<'_>,
    context: &CycleContext<'_>,
    calculated: &mut Calculated,
) -> io::Result<Vec<String>> {
    let CycleContext { loaded, links, restore } = *context;
    let mut previous = HashSet::new();
    for cycle in 1..=MAX_CYCLES {
        let has_missing_local_components = calculated.outcome.has_missing_local_components;
        let result = engine_run::run(session, loaded, calculated, restore).await?;
        // `linkCodemods` loads the components it links.
        let linking_components =
            super::session::installation_components::load(session, loaded, "linking").await?;
        linking::link_components(session, loaded, &calculated.dependencies, &linking_components)
            .await?;
        linking::sync_core_aspects(session, loaded, &calculated.engine_components)?;
        let old_non_loaded_envs = calculated.non_loaded_envs();
        after_install(session, loaded, calculated, &old_non_loaded_envs).await?;
        if !result.dependencies_changed
            || !session.options.recurring_install
            || old_non_loaded_envs.is_empty()
        {
            return Ok(old_non_loaded_envs);
        }
        previous.insert(manifests_hash(&calculated.outcome.plan));
        let engine_components = std::mem::take(&mut calculated.engine_components);
        *calculated = calculate(session, loaded, links).await?;
        calculated.engine_components = engine_components;
        let unchanged = previous.contains(&manifests_hash(&calculated.outcome.plan));
        if (unchanged && !has_missing_local_components) || cycle == MAX_CYCLES {
            return Ok(calculated.non_loaded_envs());
        }
    }
    Ok(calculated.non_loaded_envs())
}

/// What every engine run of the installation shares.
struct CycleContext<'a> {
    loaded: &'a Loaded,
    links: &'a DependencyMap,
    restore: Option<&'a engine::RestoreInput>,
}

/// Compile and write the config files through the JavaScript host, unless nothing
/// changed since its last compilation (see [`compile_stamp`]).
async fn after_install(
    session: &Session<'_>,
    loaded: &Loaded,
    calculated: &Calculated,
    non_loaded_envs: &[String],
) -> io::Result<()> {
    let request = AfterInstall {
        compile: !session.options.skip_compile,
        write_config_files: !session.options.skip_write_config_files,
        clear_cache: !non_loaded_envs.is_empty(),
    };
    if !request.compile && !request.write_config_files {
        return Ok(());
    }
    let stamp = may_skip(session, calculated, &request)
        .then(|| compile_stamp::path(&loaded.workspace.scope_path));
    let inputs = compile_stamp::Inputs {
        root: &session.root,
        bit_version: &session.info.bit_version,
        components: &calculated.components,
    };
    if let Some(stamp) = &stamp {
        let started = Instant::now();
        if let Some(restores) = compile_stamp::check(stamp, &inputs)? {
            compile_stamp::restore(&restores)?;
            // What the compile step prints (`setStatusLine`, then `consoleSuccess`),
            // without loading Harmony to compile the same files.
            session.output.status(COMPILING);
            session.output.success(COMPILING, Some(started));
            return Ok(());
        }
        compile_stamp::remove(stamp);
    }
    session.output.stop();
    let result = session.host.after_install(request).await?;
    if let (Some(stamp), Some(outputs)) = (&stamp, result.outputs) {
        compile_stamp::write(stamp, &inputs, outputs)?;
    }
    Ok(())
}

/// The status and success line of the compile step.
const COMPILING: &str = "compiling components";

/// The `afterInstall` step may be skipped: a command-line install that compiles and
/// writes the config files, with every env loaded, the filesystem cache enabled, and no
/// packages linked from outside the workspace.
fn may_skip(session: &Session<'_>, calculated: &Calculated, request: &AfterInstall) -> bool {
    if !request.compile
        || !request.write_config_files
        || request.clear_cache
        || session.options.programmatic
        || crate::dependencies::cache::disabled()
    {
        return false;
    }
    let info = session.info;
    let bit_dirs: Vec<std::path::PathBuf> = info.core_aspects
        .iter()
        .chain(&info.core_packages)
        .map(|aspect| aspect.dir.clone())
        .chain([info.bit_dir.clone()])
        .chain(info.bvm_dir.clone())
        .collect();
    !compile_stamp::has_external_links(
        &calculated.outcome.plan.projects,
        &calculated.components,
        &session.root,
        &bit_dirs,
    )
}

fn print_manifest_messages(session: &Session<'_>, calculated: &Calculated) {
    for warning in &calculated.outcome.warnings {
        session.output.warning(warning);
    }
    for message in &calculated.outcome.messages {
        session.output.console(message);
    }
}

/// `_updateRootDirs` with root components; otherwise the components' own
/// `node_modules` go, since they may hold leftovers of a previous install.
fn prepare_directories(loaded: &Loaded, calculated: &Calculated) -> io::Result<()> {
    if !loaded.config.dependency_resolver.has_root_components() {
        for component in &calculated.components {
            let _ = fs::remove_dir_all(component.dir.join("node_modules"));
        }
        return Ok(());
    }
    let root_dirs = &calculated.outcome.root_dirs;
    let base = loaded.config.root_components_path(&loaded.workspace.root);
    if let Ok(entries) = fs::read_dir(&base) {
        for entry in entries.flatten() {
            if !root_dirs.contains(&entry.path()) {
                remove_path(&entry.path())?;
            }
        }
    }
    root_dirs.iter().try_for_each(fs::create_dir_all)
}

fn remove_path(path: &Path) -> io::Result<()> {
    if path.is_dir() && !path.is_symlink() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

/// `--add-missing-deps`: missing packages not provided by the root are added to the
/// workspace policy. Returns whether any was added.
async fn add_missing_deps(
    session: &Session<'_>,
    loaded: &Loaded,
    calculated: &Calculated,
    links: &DependencyMap,
) -> io::Result<bool> {
    let provided = provided_by_root(calculated, links);
    let mut missing: Vec<String> = Vec::new();
    for dependencies in calculated.dependencies.values() {
        let packages = &dependencies.missing_packages;
        for name in packages.runtime.iter().chain(&packages.dev) {
            if !provided.contains(name) && !missing.contains(name) {
                missing.push(name.clone());
            }
        }
    }
    if missing.is_empty() {
        return Ok(false);
    }
    packages::add(session, loaded, &missing, session.options.lifecycle()).await?;
    Ok(true)
}

/// Root dependencies, linked root dependencies and the components' package names.
fn provided_by_root(calculated: &Calculated, links: &DependencyMap) -> HashSet<String> {
    let mut provided: HashSet<String> = links.keys().cloned().collect();
    let projects = &calculated.outcome.plan.projects;
    if let Some(root) = projects.first() {
        for field in ["dependencies", "devDependencies"] {
            provided.extend(dependency_names(root.manifest.get(field)));
        }
    }
    let names = projects
        .iter()
        .skip(1)
        .filter_map(|project| project.manifest.get("name").and_then(Value::as_str));
    provided.extend(names.map(ToString::to_string));
    provided
}

fn dependency_names(field: Option<&Value>) -> Vec<String> {
    field
        .and_then(Value::as_object)
        .map(|object| object.keys().cloned().collect())
        .unwrap_or_default()
}

/// `updateAllowedScripts` + `persistConfig('update allowScripts configuration')`.
fn persist_allow_scripts(
    session: &Session<'_>,
    loaded: &Loaded,
    allow_scripts: &indexmap::IndexMap<String, bool>,
) -> io::Result<()> {
    workspace_jsonc::edit(
        &session.root,
        &loaded.workspace.scope_path,
        &session.info.file_id,
        "update allowScripts configuration",
        |document| {
            for (name, allowed) in allow_scripts {
                document.set(&[DEPENDENCY_RESOLVER_ASPECT, "allowScripts", name], &json!(allowed));
            }
            if document
                .get(&[DEPENDENCY_RESOLVER_ASPECT, "policy"])
                .is_none()
            {
                document.set(&[DEPENDENCY_RESOLVER_ASPECT, "policy"], &json!({}));
            }
            if document
                .get(&[DEPENDENCY_RESOLVER_ASPECT, "linkCoreAspects"])
                .is_none()
            {
                document.set(&[DEPENDENCY_RESOLVER_ASPECT, "linkCoreAspects"], &json!(true));
            }
        },
    )
}

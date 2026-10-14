//! `--restore`: write `pnpm-lock.yaml` from the workspace components' stored
//! dependency graphs before installing (`dependenciesGraphToLockfile` in
//! `pnpm.package-manager.ts` and `convertGraphToLockfile`).

mod convert;
mod dep_path;
mod merge;

use super::{
    EngineSettings,
    config_overlay::{Query, http_client, query_config},
    error::diagnostic,
};
use crate::model::{InstallPlan, Project};
use convert::Graph;
use pnpm_lockfile::Lockfile;
use pnpm_resolving_default_resolver::{
    DefaultResolver,
    standalone::{StandaloneChainOptions, build_standalone_chain},
};
use pnpm_resolving_resolver_base::{ResolveOptions, ResolverProjectOptions, WantedDependency};
use serde_json::{Map, Value, json};
use std::{collections::HashSet, io};

/// The merged, serialized `DependenciesGraph` of the workspace components.
#[derive(Debug, Clone, PartialEq)]
pub struct RestoreInput {
    pub graph: Value,
    /// `--restore` fails the install on a graph it cannot convert; a restore
    /// Bit attempts on its own is best-effort.
    pub fail_on_error: bool,
}

/// One package whose resolution has to come from the registry.
struct PackageToResolve {
    pkg_id: String,
    name: String,
    version: String,
}

/// Write the lockfile. Only workspaces with root components restore.
pub(super) async fn write_lockfile(
    input: &RestoreInput,
    plan: &InstallPlan,
    settings: &EngineSettings,
) -> io::Result<()> {
    if !settings.layout.root_components {
        return Ok(());
    }
    let (input, plan, settings) = (input.clone(), plan.clone(), settings.clone());
    let (sender, receiver) = tokio::sync::oneshot::channel();
    std::thread::Builder::new()
        .name("bit-install-restore".to_string())
        .stack_size(32 * 1024 * 1024)
        .spawn(move || {
            let outcome = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .and_then(|runtime| {
                    runtime.block_on(restore(&input.graph, &plan.projects, &settings))
                });
            let _ = sender.send(if input.fail_on_error { outcome } else { Ok(()) });
        })?;
    receiver.await.map_err(|_| io::Error::other("the restore thread panicked"))?
}

async fn restore(
    serialized: &Value,
    projects: &[Project],
    settings: &EngineSettings,
) -> io::Result<()> {
    let graph = Graph::parse(serialized)?;
    let mut lockfile = convert::to_lockfile(&graph, projects, &settings.root);
    let mut failed = resolve_packages(&mut lockfile, &graph, projects, settings).await?;
    // A component snap still without a resolution was never published: pnpm
    // re-resolves the dependency from the manifest instead.
    for (pkg_id, package) in lockfile
        .get("packages")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        if !has_resolution(package) && graph.is_component(pkg_id) {
            failed.insert(pkg_id.clone());
        }
    }
    if !failed.is_empty() {
        merge::scrub(&mut lockfile, &failed);
    }
    merge::drop_unreachable(&mut lockfile, dep_path::remove_suffix);
    validate(&lockfile)?;
    let lockfile = match read_existing(settings)? {
        Some(existing) => merge::merge_into_existing(&existing, &lockfile),
        None => lockfile,
    };
    save(settings, lockfile)
}

fn has_resolution(package: &Value) -> bool {
    package
        .get("resolution")
        .and_then(Value::as_object)
        .is_some_and(|resolution| !resolution.is_empty())
}

/// Fill in the integrity of every registry package; return the unpublished
/// component snaps.
async fn resolve_packages(
    lockfile: &mut Map<String, Value>,
    graph: &Graph,
    projects: &[Project],
    settings: &EngineSettings,
) -> io::Result<HashSet<String>> {
    let to_resolve = packages_to_resolve(lockfile, projects);
    let resolutions = resolve_all(&to_resolve, settings).await?;
    let mut failed = HashSet::new();
    for (package, resolution) in to_resolve.iter().zip(resolutions) {
        match resolution {
            Ok(Some(integrity)) => {
                lockfile["packages"][&package.pkg_id]["resolution"] =
                    json!({ "integrity": integrity });
            }
            Ok(None) => {}
            // An unpublished snap of a workspace component: pnpm resolves the
            // dependency from the manifest instead.
            Err(message)
                if is_no_matching_version(&message) && graph.is_component(&package.pkg_id) =>
            {
                failed.insert(package.pkg_id.clone());
            }
            Err(message) => return Err(io::Error::other(message)),
        }
    }
    Ok(failed)
}

/// The integrity of every package, resolved concurrently; an error is its message.
async fn resolve_all(
    packages: &[PackageToResolve],
    settings: &EngineSettings,
) -> io::Result<Vec<Result<Option<String>, String>>> {
    let resolver = resolver(settings)?;
    let options = ResolveOptions {
        project: ResolverProjectOptions {
            project_dir: settings.root.clone(),
            lockfile_dir: settings.root.clone(),
            ..ResolverProjectOptions::default()
        },
        ..ResolveOptions::default()
    };
    let resolve = |package: &PackageToResolve| {
        let wanted = WantedDependency {
            alias: Some(package.name.clone()),
            bare_specifier: Some(package.version.clone()),
            ..WantedDependency::default()
        };
        let (resolver, options) = (&resolver, &options);
        async move {
            let resolved =
                resolver.resolve(&wanted, options).await.map_err(|error| error.to_string())?;
            Ok(resolved.resolution.integrity().map(ToString::to_string))
        }
    };
    Ok(futures_util::future::join_all(packages.iter().map(resolve)).await)
}

/// `ERR_PNPM_NO_MATCHING_VERSION`. The resolver chain erases its errors to
/// their messages, so the message is what identifies it.
fn is_no_matching_version(message: &str) -> bool {
    message.contains("ERR_PNPM_NO_MATCHING_VERSION")
        || message.contains("No matching version found")
}

/// Packages with no resolution or a directory one, except the workspace's
/// own projects at their own versions (`getPkgsToResolve`).
fn packages_to_resolve(
    lockfile: &Map<String, Value>,
    projects: &[Project],
) -> Vec<PackageToResolve> {
    let workspace: HashSet<(&str, &str)> = projects
        .iter()
        .filter_map(|project| {
            Some((
                project.manifest.get("name")?.as_str()?,
                project.manifest.get("version")?.as_str()?,
            ))
        })
        .collect();
    let mut result = Vec::new();
    for (pkg_id, package) in lockfile
        .get("packages")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        let resolution = package.get("resolution");
        let unresolved = resolution.is_none_or(Value::is_null)
            || resolution
                .and_then(|resolution| resolution.get("type"))
                .and_then(Value::as_str)
                == Some("directory");
        let parsed = dep_path::parse(pkg_id);
        if let (true, Some(name), Some(version)) = (unresolved, parsed.name, parsed.version)
            && !workspace.contains(&(name.as_str(), version.as_str()))
        {
            result.push(PackageToResolve { pkg_id: pkg_id.clone(), name, version });
        }
    }
    result
}

fn resolver(settings: &EngineSettings) -> io::Result<DefaultResolver> {
    let config = query_config(settings, &Query::Resolve);
    let client = http_client(config)?;
    build_standalone_chain(&StandaloneChainOptions {
        config,
        http_client: &client,
        full_metadata: false,
        filter_metadata: false,
    })
    .map_err(|error| diagnostic(&error))
}

fn validate(lockfile: &Map<String, Value>) -> io::Result<()> {
    for (dep_path, package) in lockfile
        .get("packages")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
    {
        if !has_resolution(package) {
            return Err(io::Error::other(format!(
                r#"Failed to generate a valid lockfile. The "packages['{dep_path}']" entry doesn't have a "resolution" field."#,
            )));
        }
    }
    Ok(())
}

fn read_existing(settings: &EngineSettings) -> io::Result<Option<Map<String, Value>>> {
    let path = settings.root.join(Lockfile::FILE_NAME);
    let Some(existing) = Lockfile::load_from_path(&path).map_err(|error| diagnostic(&error))?
    else {
        return Ok(None);
    };
    match serde_json::to_value(existing).map_err(io::Error::other)? {
        Value::Object(existing) => Ok(Some(existing)),
        _ => Ok(None),
    }
}

fn save(settings: &EngineSettings, mut lockfile: Map<String, Value>) -> io::Result<()> {
    let bit = lockfile
        .entry("bit")
        .or_insert_with(|| json!({}));
    if let Some(bit) = bit.as_object_mut() {
        bit.insert("restoredFromModel".to_string(), Value::Bool(true));
    }
    let lockfile: Lockfile = serde_json::from_value(Value::Object(lockfile))
        .map_err(|error| {
            io::Error::other(format!("the restored lockfile is not a valid lockfile: {error}"))
        })?;
    lockfile
        .save_to_path(&settings.root.join(Lockfile::FILE_NAME))
        .map_err(|error| diagnostic(&error))
}

#[cfg(test)]
mod tests;

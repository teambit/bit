//! The missing peer dependencies of the workspace root
//! (`getMissingPeerDependencies`: `getPeerDependencyIssues(...)['.'].intersections`).
//!
//! A `dry_run` fresh resolve that writes nothing and collects the peer issues,
//! like `@pnpm/napi`'s `getPeerDependencyIssues`.

#[cfg(test)]
mod tests;

use super::{
    EngineSettings, MissingPeers,
    config_overlay::{Query, query_config},
    error::diagnostic,
    reporter::{BitReporter, ReporterGuard},
    run::engine_call_lock,
    session::{Session, engine_project},
};
use crate::model::{DependencyMap, Project};
use pnpm_package_manager::{
    Install, InstallExecution, InstallLockfilePolicy, InstallProjects, PeerIssuesSink,
    ResolutionInputs,
};
use pnpm_package_manifest::DependencyGroup;
use pnpm_resolving_deps_resolver::PeerDependencyIssues;
use std::{io, sync::Arc};

/// Resolve `projects` without writing anything and return the intersected
/// ranges of the peers the root importer is missing.
pub async fn missing_peers(
    projects: &[Project],
    overrides: &DependencyMap,
    settings: &EngineSettings,
) -> io::Result<MissingPeers> {
    let _guard = engine_call_lock().lock().await;
    let projects = projects.to_vec();
    let overrides = overrides.clone();
    let settings = settings.clone();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    std::thread::Builder::new()
        .name("bit-install-peers".to_string())
        .stack_size(32 * 1024 * 1024)
        .spawn(move || {
            let _ = sender.send(peer_issues(&projects, &overrides, &settings));
        })?;
    let issues = receiver.await.map_err(|_| io::Error::other("the peer issues thread panicked"))??;
    Ok(issues
        .as_ref()
        .map(intersections)
        .unwrap_or_default())
}

/// The root importer's issues. No hooks and no reporter output, like
/// `@pnpm/napi`'s query.
fn peer_issues(
    projects: &[Project],
    overrides: &DependencyMap,
    settings: &EngineSettings,
) -> io::Result<Option<PeerDependencyIssues>> {
    let _reporter = ReporterGuard::install(None);
    let config = query_config(settings, &Query::PeerIssues { overrides });
    let session = Session::new(config, &settings.root, projects)?;
    let workspace_projects = (projects.len() > 1).then(|| {
        projects
            .iter()
            .map(|project| engine_project(&project.dir, project.manifest.clone()))
            .collect()
    });
    let sink = PeerIssuesSink::default();
    let install = session.install(vec![
        DependencyGroup::Prod,
        DependencyGroup::Dev,
        DependencyGroup::Optional,
    ]);
    let install = configure(install, workspace_projects, Arc::clone(&sink), &session);
    session.runtime.block_on(install.run::<BitReporter>()).map_err(|error| diagnostic(&error))?;
    let mut issues = sink.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    Ok(issues.remove("."))
}

/// A full fresh resolve, never frozen, never short-circuited, that writes nothing.
fn configure<'a>(
    install: Install<'a, Vec<DependencyGroup>>,
    workspace_projects: Option<Vec<pnpm_workspace::Project>>,
    sink: PeerIssuesSink,
    session: &'a Session,
) -> Install<'a, Vec<DependencyGroup>> {
    Install {
        lockfile_policy: InstallLockfilePolicy {
            frozen: false,
            prefer_frozen: Some(false),
            disable_optimistic_repeat: true,
            ..install.lockfile_policy
        },
        execution: InstallExecution {
            skip_runtimes: false,
            lockfile_only: false,
            dry_run: true,
            ..install.execution
        },
        resolution: ResolutionInputs { peer_issues_sink: Some(sink), ..install.resolution },
        context: pnpm_package_manager::InstallInvocation {
            lockfile_path: Some(&session.lockfile_path),
            ..install.context
        },
        projects: InstallProjects {
            supported_architectures: None,
            workspace_projects_override: workspace_projects,
            ..install.projects
        },
        ..install
    }
}

/// `intersections` of v11's `mergePeers`: all-optional peers are skipped, a
/// single range passes through, several ranges are intersected; a peer whose
/// ranges do not intersect is a conflict and has no entry.
pub(super) fn intersections(issues: &PeerDependencyIssues) -> MissingPeers {
    let mut names: Vec<_> = issues.missing.keys().collect();
    names.sort();
    let mut result = MissingPeers::new();
    for name in names {
        let entries = &issues.missing[name];
        if entries.iter().all(|entry| entry.optional) {
            continue;
        }
        if let Some(range) = safe_intersect(entries.iter().map(|entry| entry.wanted_range.as_str()))
        {
            result.insert(name.clone(), range);
        }
    }
    result
}

/// Intersect semver ranges pairwise; `None` when one fails to parse or the
/// intersection is empty. A single range passes through verbatim.
pub(super) fn safe_intersect<'a>(mut ranges: impl Iterator<Item = &'a str>) -> Option<String> {
    let first = ranges.next()?;
    let rest: Vec<&str> = ranges.collect();
    if rest.is_empty() {
        return Some(first.to_string());
    }
    let mut acc: node_semver::Range = first.parse().ok()?;
    for range in rest {
        acc = acc.intersect(&range.parse().ok()?)?;
    }
    Some(acc.to_string())
}

//! `ObjectFetcher` streams cached dependency objects before their first consumer-side cache read.
//!
//! Collects and stages missing flattened dependencies ([`finish`]) when `fetchAllDependencies` is forced.
use super::{PreparedImport, Target, dependencies::dependency_target, identity, invalid};
use std::{collections::HashSet, io};

/// Stage missing flattened dependencies for `roots` via [`collect_forced_dependencies`] when `fetchAllDependencies` is forced.
pub(super) fn finish(plan: &mut PreparedImport, roots: &[&Target]) -> io::Result<()> {
    let identities = roots
        .iter()
        .map(|target| identity(target))
        .collect::<io::Result<HashSet<_>>>()?;
    let phase =
        plan.progress.last_mut().ok_or_else(|| invalid("import forced dependency phase"))?;
    if !has_matching_phase_id(&phase.ids, &identities) {
        return Ok(());
    }
    phase.ids.retain(|id| identities.contains(without_version(id)));
    let received: HashSet<String> = phase.components
        .iter()
        .map(|rec| rec.trim().to_owned())
        .collect();
    let dependencies = collect_forced_dependencies(plan, roots, &received)?;
    plan.prepare_versions_with_reason(
        &dependencies,
        Some("for getting all dependencies - missing dependencies"),
    )
}

/// Collect deduplicated flattened dependency [`Target`]s across `roots` and clear received unbuilt entries.
fn collect_forced_dependencies(
    plan: &mut PreparedImport,
    roots: &[&Target],
    received: &HashSet<String>,
) -> io::Result<Vec<Target>> {
    let mut dependencies = Vec::new();
    let mut seen = HashSet::new();
    for target in roots {
        let version = plan.policy_version(target)?;
        let rows = super::dependencies::flattened_dependencies(plan, &version)?;
        for row in &rows {
            let mut dependency = dependency_target(row)?;
            dependency.version = dependency.version.trim().into();
            let id = identity(&dependency)?;
            let key = format!("{id}@{}", dependency.version);
            if seen.contains(&key) {
                continue;
            }
            if received.contains(&id) {
                plan.cache.unbuilt.remove(&key);
            }
            seen.insert(key);
            dependencies.push(dependency);
        }
    }
    Ok(dependencies)
}

/// Return `true` when any versioned ID in `ids` matches a base identity in `identities` ([`HashSet`]) via [`without_version`].
#[inline]
fn has_matching_phase_id(ids: &[String], identities: &HashSet<String>) -> bool {
    ids.iter()
        .any(|id| identities.contains(without_version(id)))
}

/// Strip any trailing `@version` suffix from `id`, returning the bare component identity.
#[inline]
fn without_version(id: &str) -> &str {
    let id = id.trim();
    id.rsplit_once('@').map_or(id, |(identity, _)| identity.trim())
}

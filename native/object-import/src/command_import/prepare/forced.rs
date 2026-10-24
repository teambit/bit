//! `ObjectFetcher` streams cached dependency objects before their first consumer-side cache read.
use super::{PreparedImport, Target, dependencies::dependency_target, identity, invalid};
use std::{collections::HashSet, io};

pub(super) fn finish(plan: &mut PreparedImport, roots: &[&Target]) -> io::Result<()> {
    let identities = roots
        .iter()
        .map(|target| identity(target))
        .collect::<io::Result<HashSet<_>>>()?;
    let phase =
        plan.progress.last_mut().ok_or_else(|| invalid("import forced dependency phase"))?;
    if !phase.ids
        .iter()
        .any(|id| identities.contains(without_version(id)))
    {
        return Ok(());
    }
    phase.ids.retain(|id| identities.contains(without_version(id)));
    let received = phase.components.clone();
    let mut dependencies = Vec::new();
    let mut seen = HashSet::new();
    for target in roots {
        let version = plan.policy_version(target)?;
        for row in version["flattenedDependencies"]
            .as_array()
            .ok_or_else(|| invalid("import forced dependencies"))?
        {
            let dependency = dependency_target(row)?;
            let id = identity(&dependency)?;
            let key = format!("{id}@{}", dependency.version);
            if !seen.insert(key.clone()) {
                continue;
            }
            if received.contains(&id) {
                plan.cache.unbuilt.remove(&key);
            }
            dependencies.push(dependency);
        }
    }
    plan.prepare_versions_with_reason(
        &dependencies,
        Some("for getting all dependencies - missing dependencies"),
    )
}

fn without_version(id: &str) -> &str {
    id.rsplit_once('@').map_or(id, |(identity, _)| identity)
}

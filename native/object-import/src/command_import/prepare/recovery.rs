//! Recovery's cache=true importer keeps locally staged components without an origin refresh.
//!
//! Partitions recovery [`Target`]s via [`retain`] into locally staged components and remote refresh candidates.
use super::{PreparedImport, Target, invalid, object_hash, read_model, transfer, version_ref};
use serde_json::Value;
use std::{io, path::Path};

/// Partition `targets` into locally staged recovery targets and remote refresh candidates.
pub(super) fn retain<'a>(
    plan: &mut PreparedImport,
    targets: &[&'a Target],
) -> io::Result<(Vec<&'a Target>, Vec<&'a Target>)> {
    let mut local = Vec::new();
    let mut remote = Vec::new();
    let directory = plan.environment.local_directory.clone();
    for target in targets {
        if let Some(model) = read_model(plan, &directory, target)?.filter(staged) {
            retain_version(plan, target, &model, &directory)?;
            local.push(*target);
        } else {
            remote.push(*target);
        }
    }
    Ok((local, remote))
}

#[inline]
fn staged(model: &Value) -> bool {
    model["state"]["versions"]
        .as_object()
        .is_some_and(|versions| {
            versions
                .values()
                .any(|version| version["local"] == true)
        })
}
fn retain_version(
    plan: &mut PreparedImport,
    target: &Target,
    model: &Value,
    directory: &Path,
) -> io::Result<()> {
    let hash = version_ref(model, &target.version)?;
    let version = plan.capture
        .object(directory, &hash, "Version")?
        .ok_or_else(|| invalid("recovery local Version"))?;
    let value = version.value.as_ref().ok_or_else(|| invalid("recovery local Version metadata"))?;
    crate::history_query::validate_version(value)?;
    transfer::retain_sources(plan, directory, value, false)?;
    plan.overlay.objects.insert(hash, version);
    let scoped_hash = object_hash(&super::identity(target)?);
    let (comp_hash, comp_obj) =
        if let Some(obj) = plan.capture.object(directory, &scoped_hash, "Component")? {
            (scoped_hash, obj)
        } else {
            let unscoped = object_hash(target.name.trim());
            let obj = plan.capture
                .object(directory, &unscoped, "Component")?
                .ok_or_else(|| invalid("recovery local Component"))?;
            (unscoped, obj)
        };
    plan.overlay.objects.insert(comp_hash, comp_obj);
    Ok(())
}

pub(super) fn record_local_main(
    plan: &mut PreparedImport,
    targets: &[&Target],
    remotes: &Value,
) -> io::Result<()> {
    for target in targets {
        let scope = target.scope
            .as_deref()
            .map(str::trim)
            .filter(|scope| !scope.is_empty())
            .ok_or_else(|| invalid("recovery local scope"))?;
        let file = remotes[scope]
            .as_str()
            .is_some_and(|host| host.trim().starts_with("file://"));
        if file {
            super::remote(plan, remotes, scope)?;
        }
        let progress = plan.progress.last_mut().ok_or_else(|| invalid("recovery main progress"))?;
        progress.ids.push(super::identity(target)?);
        if file {
            progress.objects.insert(object_hash(scope));
        }
    }
    Ok(())
}

pub(super) fn retain_cached_versions(
    plan: &mut PreparedImport,
    targets: &[Target],
) -> io::Result<()> {
    if targets.is_empty() {
        return Ok(());
    }
    if targets.len() > 4096 {
        return Err(invalid("recovery cached target limit"));
    }
    let directory = plan.environment.local_directory.clone();
    for target in targets {
        if target.scope
            .as_deref()
            .is_none_or(|scope| scope.trim().is_empty())
        {
            continue;
        }
        let model =
            read_model(plan, &directory, target)?.ok_or_else(|| invalid("recovery cached model"))?;
        let hash = version_ref(&model, &target.version)?;
        if plan.overlay.read(&hash, "Version")?.is_none() {
            retain_version(plan, target, &model, &directory)?;
        }
    }
    Ok(())
}

/// `ImportComponents` fetches divergence after cached staged models are loaded.
/// This populates local history without receiving another transfer object.
pub(super) fn retain_histories(plan: &mut PreparedImport, targets: &[&Target]) -> io::Result<()> {
    let directory = plan.environment.local_directory.clone();
    for target in targets {
        let model = read_model(plan, &directory, target)?
            .ok_or_else(|| invalid("recovery divergence model"))?;
        let head = model["head"]
            .as_str()
            .or_else(|| model["head"]["ref"].as_str())
            .or_else(|| model["head"]["hash"].as_str())
            .map(str::trim)
            .filter(|head| !head.is_empty())
            .or_else(|| {
                let candidate = target.version.trim();
                crate::merge_history::hash(candidate).is_ok().then_some(candidate)
            })
            .ok_or_else(|| invalid("recovery divergence head"))?;
        let (hash, history, changed) =
            super::history::populate(&mut plan.capture, &directory, &model, head)?;
        if changed {
            let object = super::super::publish::object(&hash, "VersionHistory", history)?;
            plan.overlay.objects.insert(hash, object);
        }
    }
    Ok(())
}

impl PreparedImport {
    /// Workspace writes need unchanged cached Versions and Sources in the same retained overlay.
    #[inline]
    pub(crate) fn retain_workspace_versions(&mut self, targets: &[Target]) -> io::Result<()> {
        retain_cached_versions(self, targets)
    }
}

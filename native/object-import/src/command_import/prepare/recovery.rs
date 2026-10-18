//! Recovery's cache=true importer keeps locally staged components without an origin refresh.
use super::{PreparedImport, Target, invalid, object_hash, read_model, transfer, version_ref};
use serde_json::Value;
use std::{io, path::Path};

pub(super) fn retain<'a>(
    plan: &mut PreparedImport,
    targets: &[&'a Target],
) -> io::Result<(Vec<&'a Target>, Vec<&'a Target>)> {
    let mut local = Vec::new();
    let mut remote = Vec::new();
    let directory = plan.environment.local_directory.clone();
    for target in targets {
        let model = read_model(plan, &directory, target)?;
        let staged = model.as_ref().is_some_and(staged);
        if !staged {
            remote.push(*target);
            continue;
        }
        let model = model.ok_or_else(|| invalid("recovery local model"))?;
        retain_version(plan, target, &model, &directory)?;
        local.push(*target);
    }
    Ok((local, remote))
}

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
    let hash = object_hash(&super::identity(target)?);
    let model = plan.capture
        .object(directory, &hash, "Component")?
        .ok_or_else(|| invalid("recovery local Component"))?;
    plan.overlay.objects.insert(hash, model);
    Ok(())
}

pub(super) fn record_local_main(
    plan: &mut PreparedImport,
    targets: &[&Target],
    remotes: &Value,
) -> io::Result<()> {
    for target in targets {
        let scope = target.scope.as_deref().ok_or_else(|| invalid("recovery local scope"))?;
        let file = remotes[scope]
            .as_str()
            .is_some_and(|host| host.starts_with("file://"));
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
    let directory = plan.environment.local_directory.clone();
    for target in targets {
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
        let head = model["head"].as_str().ok_or_else(|| invalid("recovery divergence head"))?;
        let (hash, history, changed) =
            super::history::populate(&mut plan.capture, &directory, &model, head)?;
        if changed {
            plan.overlay.objects.insert(
                hash.clone(),
                super::super::publish::object(&hash, "VersionHistory", history)?,
            );
        }
    }
    Ok(())
}

impl PreparedImport {
    /// Workspace writes need unchanged cached Versions and Sources in the same retained overlay.
    pub(crate) fn retain_workspace_versions(&mut self, targets: &[Target]) -> io::Result<()> {
        retain_cached_versions(self, targets)
    }
}

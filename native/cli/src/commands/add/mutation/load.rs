//! Native projected capture and cache publication shared by workspace identity operations.
use super::{
    super::{cache, docs, projection::Projection},
    controls, selection,
};
use crate::{
    commands::{
        engine::Engine,
        status::{
            capture::{self, CaptureOptions},
            environments::Environments,
        },
        workspace_command,
    },
    host::Host,
};
use serde_json::{Value, json};
use std::{io, path::Path, sync::Arc};

pub(super) struct Loaded {
    pub engine: Engine,
    pub projection: Projection,
    pub capture: capture::Capture,
}

pub(super) fn prepare(
    root: &Path,
    bitmap: &Value,
    identities: &[String],
    environment: &mut Option<Environments>,
    stdout: &mut String,
) -> io::Result<Loaded> {
    prepare_with(root, bitmap, identities, environment, stdout, true)
}
fn prepare_with(
    root: &Path,
    bitmap: &Value,
    identities: &[String],
    environment: &mut Option<Environments>,
    stdout: &mut String,
    invalidate: bool,
) -> io::Result<Loaded> {
    let cache = bit_install::dependencies::cache::invalidation::deps_dir(root);
    if invalidate {
        bit_install::dependencies::cache::invalidation::invalidate(root, &cache)?;
    }
    let (mut engine, projection) = projected(root, bitmap, identities)?;
    controls::validate(&mut engine, &projection.context)?;
    let environments = project(root, bitmap, &projection, environment, stdout, !invalidate)?;
    let home = workspace_command::home();
    let mut capture = capture::capture_with(
        &mut engine,
        root,
        &home,
        &projection.context,
        &projection.selected,
        CaptureOptions {
            environments: Some(environments.for_checkout()),
            allow_special_states: true,
            ..Default::default()
        },
    )?;
    controls::retain(&projection.context, &mut capture)?;
    stdout.push_str(&capture::callback_startup_stdout(&capture));
    stdout.push_str(&capture::callback_load_stdout(&capture));
    Ok(Loaded { engine, projection, capture })
}

pub(super) fn projected(
    root: &Path,
    bitmap: &Value,
    identities: &[String],
) -> io::Result<(Engine, Projection)> {
    let mut engine = Engine::new()?;
    let home = workspace_command::home();
    let context =
        engine.request(&json!({"kind":"trackingContext","root":root,"home":home,"bitmap":bitmap}))?;
    Ok((engine, selection::prepare(root, bitmap, identities, context)?))
}

fn project(
    root: &Path,
    bitmap: &Value,
    projection: &Projection,
    environment: &mut Option<Environments>,
    stdout: &mut String,
    retain_loaded: bool,
) -> io::Result<Environments> {
    let mut environments = environment
        .take()
        .ok_or_else(|| io::Error::other("identity provider session unavailable"))?;
    let result = if retain_loaded {
        environments.project_tracking_retained(root, bitmap, &projection.components)
    } else {
        environments.project_tracking(root, bitmap, &projection.components)
    };
    stdout.push_str(&result.map_err(|error| environments.failure(error))?);
    if let Some(error) = &projection.load_error {
        return Err(io::Error::other(error.clone()));
    }
    docs::load(root, &mut environments, &projection.loading_components())?;
    Ok(environments)
}

pub(super) fn commit(root: &Path, loaded: &mut Loaded) -> io::Result<()> {
    cache::restrict(root, &mut loaded.capture);
    loaded.engine.validate_read_set(
        &loaded.capture.dependency_read_set(),
        "identity component facts changed",
    )?;
    capture::commit(&mut loaded.engine, root, &loaded.projection.context, &loaded.capture)
}

pub(super) fn host(capture: &mut capture::Capture) -> io::Result<Arc<Host>> {
    let environment = capture::take_callback_environment(capture)
        .ok_or_else(|| io::Error::other("identity callback environment"))?;
    Ok(Arc::new(
        environment
            .into_tracking_host()
            .ok_or_else(|| io::Error::other("identity package host"))?,
    ))
}

pub(super) fn capture(
    root: &Path,
    bitmap: &Value,
    identities: &[String],
    environment: &mut Option<Environments>,
    stdout: &mut String,
) -> io::Result<capture::Capture> {
    capture_with(root, bitmap, identities, environment, stdout, true, true)
}
pub(super) fn capture_cached(
    root: &Path,
    bitmap: &Value,
    identities: &[String],
    environment: &mut Option<Environments>,
    stdout: &mut String,
    invalidate: bool,
) -> io::Result<capture::Capture> {
    capture_with(root, bitmap, identities, environment, stdout, invalidate, true)
}
fn capture_with(
    root: &Path,
    bitmap: &Value,
    identities: &[String],
    environment: &mut Option<Environments>,
    stdout: &mut String,
    invalidate: bool,
    hydrate: bool,
) -> io::Result<capture::Capture> {
    let mut loaded = prepare_with(root, bitmap, identities, environment, stdout, invalidate)?;
    commit(root, &mut loaded)?;
    finish_capture(loaded, environment, stdout, hydrate)
}

fn finish_capture(
    mut loaded: Loaded,
    environment: &mut Option<Environments>,
    stdout: &mut String,
    hydrate: bool,
) -> io::Result<capture::Capture> {
    if hydrate {
        enrich(&mut loaded)?;
    }
    let host = host(&mut loaded.capture)?;
    stdout.push_str(&host.take_stdout());
    let host = Arc::try_unwrap(host)
        .map_err(|_| io::Error::other("identity capture host still borrowed"))?;
    *environment = Some(Environments::from_host(host).for_checkout());
    for row in &mut loaded.capture.captured {
        if let Some(component) = loaded.capture.components
            .iter()
            .find(|component| {
                row["identity"]
                    == component.identity
                        .split('@')
                        .next()
                        .unwrap_or(&component.identity)
            })
        {
            row["packageName"] = json!(component.package_name);
            row["componentIdentity"] = json!(component.identity);
            row["componentDependencies"] = json!(component.dependencies);
        }
    }
    Ok(loaded.capture)
}

pub(super) fn capture_consumer(
    root: &Path,
    bitmap: &Value,
    identities: &[String],
    environment: &mut Option<Environments>,
    stdout: &mut String,
) -> io::Result<capture::Capture> {
    let mut loaded = prepare_with(root, bitmap, identities, environment, stdout, false)?;
    let histories: Value = loaded.engine.request(&json!({"kind":"statusModels","root":root,"history":true,"stageHistory":true,"historyTargetsOnly":true,"includeHeads":true,
        "currentLaneId":loaded.projection.context["currentLaneId"],
        "targets":loaded.projection.selected.iter().map(|row|json!({"identity":row["identity"],"version":row["version"]})).collect::<Vec<_>>()}))?;
    loaded.projection.context["pendingHistory"] = histories
        .get("pendingHistory")
        .cloned()
        .unwrap_or(json!([]));
    commit(root, &mut loaded)?;
    let targets = loaded.capture.comparisons
        .iter()
        .cloned()
        .map(|mut row| {
            if let Some(row) = row.as_object_mut() {
                row.remove("trackingVersion");
            }
            row
        })
        .collect::<Vec<_>>();
    let compared: Value =
        loaded.engine.request(&json!({"kind":"statusCompare","root":root,"targets":targets}))?;
    for row in &mut loaded.capture.captured {
        row["modified"] = compared["comparisons"]
            .as_array()
            .and_then(|rows| {
                rows.iter()
                    .find(|other| other["identity"] == row["identity"])
            })
            .map_or(Value::Bool(false), |row| row["modified"].clone());
    }
    finish_capture(loaded, environment, stdout, true)
}

pub(super) fn enrich(loaded: &mut Loaded) -> io::Result<()> {
    let rows = crate::commands::status::environments::hydration_rows(
        &loaded.capture,
        &loaded.projection.context,
    )?;
    for row in rows {
        let current = loaded.capture.captured
            .iter_mut()
            .find(|current| current["identity"] == row["identity"])
            .ok_or_else(|| io::Error::other("cached hydration identity"))?;
        current
            .as_object_mut()
            .ok_or_else(|| io::Error::other("cached hydration row"))?
            .extend(
                row.as_object()
                    .ok_or_else(|| io::Error::other("cached hydration receipt"))?
                    .clone(),
            );
    }
    Ok(())
}

/// `NodeModuleLinker` clears loaded classes when generated package metadata changes.
pub(super) fn invalidate_changed(
    root: &Path,
    components: &[bit_install::model::WorkspaceComponent],
    manifests: &cache::Manifests,
    host: &Host,
) -> io::Result<()> {
    if manifests.changed() {
        cache::invalidate(root, components)?;
        host.call("identityClearLoadCache", &json!({}))?;
    }
    Ok(())
}

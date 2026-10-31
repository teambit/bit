//! Component-load caches, native package links, then one bitmap publication.
use super::{
    Prepared, cache, cleanup, dependencies, linking, output, projection::Projection, remote, report,
};
use crate::{
    commands::{
        color::Chalk,
        install::JsHost,
        status::capture,
        workspace_command::{self, results::Report},
    },
    host::Host,
};
use bit_install::model::WorkspaceComponent;
use bit_object_import::component_tracking::Plan;
use std::{io, path::Path, sync::Arc};

pub(super) fn run(
    root: &Path,
    mut prepared: Prepared,
    json: bool,
    chalk: Chalk,
    output: &bit_install::output::Output,
) -> io::Result<Report> {
    if let Some(error) = &prepared.projection.load_error {
        return Err(io::Error::other(error.clone()));
    }
    prepared.plan.validate()?;
    let Some(mut capture) = prepared.capture.take() else {
        cleanup::temporary(root)?;
        return report(&prepared.plan, json, chalk);
    };
    let host = publish(root, &mut prepared, &mut capture, json, chalk)?;
    cleanup::temporary(root)?;
    prepared.plan.commit(&workspace_command::file_id())?;
    if !json {
        remote::warn(&host, prepared.plan.components(), &prepared.projection, chalk, output);
    }
    report(&prepared.plan, json, chalk)
}

fn publish(
    root: &Path,
    prepared: &mut Prepared,
    capture: &mut capture::Capture,
    json: bool,
    chalk: Chalk,
) -> io::Result<Arc<Host>> {
    let environment = capture::take_callback_environment(capture)
        .ok_or_else(|| io::Error::other("tracking callback environment"))?;
    let host = Arc::new(
        environment
            .into_tracking_host()
            .ok_or_else(|| io::Error::other("tracking package host"))?,
    );
    let mut components = components(&prepared.plan, &prepared.projection);
    linking::overlay(&mut components, &capture.captured)?;
    cache::restrict(root, capture);
    validate(prepared, capture)?;
    capture::commit(&mut prepared.engine, root, &prepared.projection.context, capture)?;
    let manifests = cache::Manifests::observe(root, &components);
    let linked = link(root, &prepared.projection, capture, &components, &host, json, chalk);
    print!("{}", host.take_stdout());
    linked?;
    if manifests.changed() {
        cache::invalidate(root, &components)?;
    }
    Ok(host)
}

fn components(plan: &Plan, projection: &Projection) -> Vec<WorkspaceComponent> {
    plan.components()
        .iter()
        .filter(|row| {
            (non_empty_str(&row["rootDir"]).is_some() || non_empty_str(&row["directory"]).is_some())
                && row["files"]
                    .as_array()
                    .is_some_and(|files| !files.is_empty())
        })
        .filter_map(|row| {
            let identity = non_empty_str(&row["identity"]).or_else(|| non_empty_str(&row["id"]))?;
            let bare = identity
                .split('@')
                .next()
                .unwrap_or(identity)
                .trim();
            projection.workspace.components
                .iter()
                .find(|component| component.id.to_string_without_version() == bare)
                .cloned()
        })
        .collect()
}

fn non_empty_str(value: &serde_json::Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}
fn validate(prepared: &mut Prepared, capture: &capture::Capture) -> io::Result<()> {
    prepared.engine.validate_read_set(
        &capture.dependency_read_set(),
        "tracking component facts changed",
    )
}

pub(super) fn link(
    root: &Path,
    projection: &Projection,
    capture: &capture::Capture,
    components: &[WorkspaceComponent],
    host: &Arc<Host>,
    json: bool,
    chalk: Chalk,
) -> io::Result<()> {
    link_rows(root, projection, &capture.captured, components, host, json, chalk)
}
pub(super) fn link_rows(
    root: &Path,
    projection: &Projection,
    captured: &[serde_json::Value],
    components: &[WorkspaceComponent],
    host: &Arc<Host>,
    json: bool,
    chalk: Chalk,
) -> io::Result<()> {
    let dependencies = dependencies::packages(captured)?.into_iter().collect();
    let adapter = JsHost::new(Arc::clone(host), json);
    let config = bit_install::config::WorkspaceConfig::from_value(
        root.join("workspace.jsonc"),
        projection.context["workspace"].clone(),
    )?;
    let roots = config.root_components_path(root);
    let aspects: Vec<String> = serde_json::from_value(host.call(
        "trackingAspectComponents",
        &serde_json::json!({"components":captured}),
    )?)?;
    let aspect_env_ids = aspect_environments(components, &aspects);
    let options = bit_install::links::ComponentLinkOptions {
        has_root_components: config.dependency_resolver.has_root_components(),
        root_components_dir: &roots,
        dependencies: &dependencies,
        cloud_domain: "bit.cloud",
        windows: cfg!(windows),
        aspect_env_ids: &aspect_env_ids,
    };
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .worker_threads(2)
        .build()?;
    runtime
        .block_on(bit_install::links::link_tracking_components(
            root, components, &adapter, &options,
        ))
        .map_err(|error| output::link_error(linking::error(root, components, error), chalk))?;
    Ok(())
}
fn aspect_environments(components: &[WorkspaceComponent], aspects: &[String]) -> Vec<String> {
    components
        .iter()
        .filter(|component| aspects.contains(&component.id.to_string_without_version()))
        .map(|component| component.env_id.clone())
        .collect()
}
fn report(plan: &Plan, json: bool, chalk: Chalk) -> io::Result<Report> {
    let data = if json {
        serde_json::to_string_pretty(&report::json(plan.components(), plan.warnings()))?
    } else {
        report::text(plan.components(), plan.warnings(), chalk)?
    };
    Ok(Report { data, code: 0, details: None })
}

//! Pure eligibility precedes provider startup and authoritative projected loading.
use super::{Prepared, diagnostics, docs, options, projection};
use crate::commands::{
    engine::Engine,
    status::{
        autosync::Startup,
        capture::{self, CaptureOptions},
        environments::Environments,
    },
    workspace_command,
};
use bit_object_import::component_tracking::{Options as Tracking, Plan};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn prepare(
    root: &Path,
    cwd: &Path,
    options: &options::Options,
    startup: &mut Startup,
) -> io::Result<Prepared> {
    let mut engine = Engine::new()?;
    let home = workspace_command::home();
    let (context, preflight) = context(&mut engine, root, cwd, &home, options)?;
    if diagnostics::ci() && options.env.is_some() {
        let probe =
            projection::prepare(root, preflight.bitmap(), preflight.components(), context.clone())?;
        diagnostics::links(root, &probe)?;
    }
    let mut environments = Environments::for_tracking();
    let tracking = environment_options(root, options, &mut environments, startup)?;
    let plan = Plan::prepare(
        root,
        cwd,
        &tracking,
        &json!({"workspace":context["workspace"],"models":context["models"]}),
    )?;
    let projection = projection::prepare(root, plan.bitmap(), plan.components(), context)?;
    if !startup.committed {
        diagnostics::links(root, &projection)?;
    }
    let capture = load(&mut engine, root, &home, &plan, &projection, environments, startup)?;
    Ok(Prepared { plan, projection, capture, engine })
}

fn context(
    engine: &mut Engine,
    root: &Path,
    cwd: &Path,
    home: &Path,
    options: &options::Options,
) -> io::Result<(Value, Plan)> {
    let workspace = bit_object_import::effective_workspace_configuration(root, home)?;
    let preflight = Plan::prepare(root, cwd, &options.tracking, &json!({"workspace":workspace}))?;
    let context = engine.request(
        &json!({"kind":"trackingContext","root":root,"home":home,"bitmap":preflight.bitmap()}),
    )?;
    Ok((context, preflight))
}

fn environment_options(
    root: &Path,
    options: &options::Options,
    environments: &mut Environments,
    startup: &mut Startup,
) -> io::Result<Tracking> {
    let mut tracking = options.tracking.clone();
    if let Some(env) = options.env
        .as_deref()
        .map(str::trim)
        .filter(|env| !env.is_empty())
    {
        startup.committed = true;
        let facts = environments.tracking_env_config(root, env)?;
        tracking.config = build_env_tracking_config(&facts)?;
    }
    Ok(tracking)
}

fn build_env_tracking_config(facts: &Value) -> io::Result<Value> {
    let configured = extract_env_id(facts, "configuredId")
        .ok_or_else(|| io::Error::other("tracking environment identity"))?;
    let resolved = extract_env_id(facts, "resolvedId").unwrap_or(configured);
    Ok(json!({(configured):{},"teambit.envs/envs":{"env":resolved}}))
}

fn extract_env_id<'a>(facts: &'a Value, key: &str) -> Option<&'a str> {
    let value = facts.get(key)?;
    value
        .as_str()
        .or_else(|| value.get("id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn load(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    plan: &Plan,
    projection: &projection::Projection,
    mut environments: Environments,
    startup: &mut Startup,
) -> io::Result<Option<capture::Capture>> {
    if plan.components().is_empty() {
        return Ok(None);
    }
    startup.committed = true;
    startup.stdout.push_str(&environments.project_tracking(
        root,
        plan.bitmap(),
        &projection.components,
    )?);
    if projection.load_error.is_some() {
        return Ok(None);
    }
    let selected = projection.loading_components();
    docs::load(root, &mut environments, &selected)?;
    let capture = capture::capture_with(
        engine,
        root,
        home,
        &projection.context,
        &projection.selected,
        CaptureOptions {
            environments: Some(environments.for_checkout()),
            allow_special_states: true,
            ..Default::default()
        },
    )?;
    workspace_command::checkout_lifecycle::retain(Some(startup), &capture);
    Ok(Some(capture))
}

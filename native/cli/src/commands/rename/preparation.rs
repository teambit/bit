//! Pure source inventory and eligibility precede Harmony providers and publication.
use crate::commands::{engine::Engine, workspace_command};
use bit_install::{config::WorkspaceConfig, workspace::Workspace};
use bit_object_import::component_rename::{Options, Plan, batch::Batch};
use serde_json::{Value, json};
use std::{fs, io, path::Path};

pub(in crate::commands) struct Prepared {
    pub(in crate::commands) plan: Plan,
    pub(in crate::commands) facts: Value,
}
pub(in crate::commands) fn prepare(root: &Path, options: &Options) -> io::Result<Prepared> {
    bit_object_import::component_rename::validate_name(&options.target)?;
    let (workspace, mut facts, mut engine) = inventory(root)?;
    packages(&workspace, options, &mut facts)?;
    let plan = Plan::prepare(root, options, &facts)?;
    validate_inventory(&mut engine, &facts)?;
    Ok(Prepared { plan, facts })
}
/// Share pure native inventory while retaining per-entry planning and error order.
pub(in crate::commands) fn prepare_many(
    root: &Path,
    options: &[Options],
) -> io::Result<Vec<Prepared>> {
    if options.is_empty() {
        return Ok(Vec::new());
    }
    let (workspace, shared, mut engine) = inventory(root)?;
    let mut facts = Vec::with_capacity(options.len());
    let mut package_error = None;
    for option in options {
        let mut component = shared.clone();
        if let Err(error) = packages(&workspace, option, &mut component) {
            package_error = Some(error);
            break;
        }
        facts.push(component);
    }
    // An earlier plan failure precedes a later package lookup failure, matching
    // the former serial prepare loop. Parallel plan results are ordered too.
    let plans = Batch::prepare_plans(root, &options[..facts.len()], &facts)?;
    if let Some(error) = package_error {
        return Err(error);
    }
    validate_inventory(&mut engine, &shared)?;
    Ok(plans
        .into_iter()
        .zip(facts)
        .map(|(plan, facts)| Prepared { plan, facts })
        .collect())
}
fn inventory(root: &Path) -> io::Result<(Workspace, Value, Engine)> {
    let bitmap = bit_object_import::parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    let mut engine = Engine::new()?;
    let context:Value=engine.request(&json!({"kind":"trackingContext","root":root,"home":workspace_command::home(),"bitmap":bitmap}))?;
    let config =
        WorkspaceConfig::from_value(root.join("workspace.jsonc"), context["workspace"].clone())?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))?;
    let workspace = Workspace::load_projected(root, &config, &core, &bitmap)?;
    let components:Vec<Value>=workspace.components.iter().map(|component|json!({"identity":component.id.to_string_without_version(),"rootDir":component.root_dir,"files":component.files,"packageName":component.package_name})).collect();
    Ok((
        workspace,
        json!({"components":components,"preflight":true,"inventoryReadSet":context["controlReadSet"]}),
        engine,
    ))
}

fn validate_inventory(engine: &mut Engine, facts: &Value) -> io::Result<()> {
    let reads = facts["inventoryReadSet"]
        .as_array()
        .ok_or_else(|| io::Error::other("rename inventory control proofs"))?;
    engine.validate_read_set(reads, "rename inventory controls changed before component loading")
}

fn packages(workspace: &Workspace, options: &Options, facts: &mut Value) -> io::Result<()> {
    let component = workspace.components
        .iter()
        .find(|component| {
            component.id.name == options.source
                || component.id.to_string_without_version() == options.source
        })
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("component {} was not found", options.source),
            )
        })?;
    facts["sourcePackage"] = json!(component.package_name);
    let mut id = component.id.clone();
    id.name.clone_from(&options.target);
    id.scope = None;
    id.version = None;
    id.default_scope = options.scope
        .clone()
        .or_else(|| component.id.effective_scope().map(str::to_owned));
    facts["targetPackage"] =
        json!(bit_install::workspace::component_package_name(&id, None, &component.config));
    Ok(())
}

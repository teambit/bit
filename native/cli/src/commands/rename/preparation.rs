//! Pure source inventory and eligibility precede Harmony providers and publication.
use crate::commands::{engine::Engine, workspace_command};
use bit_install::{config::WorkspaceConfig, workspace::Workspace};
use bit_object_import::component_rename::{Options, Plan};
use serde_json::{Value, json};
use std::{fs, io, path::Path};

pub(super) struct Prepared {
    pub(super) plan: Plan,
    pub(super) facts: Value,
}
pub(super) fn prepare(root: &Path, options: &Options) -> io::Result<Prepared> {
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
    let mut facts = json!({"components":components,"preflight":true});
    packages(&workspace, options, &mut facts)?;
    let plan = Plan::prepare(root, options, &facts)?;
    Ok(Prepared { plan, facts })
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

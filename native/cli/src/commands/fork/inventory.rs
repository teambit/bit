use crate::commands::{engine::Engine, workspace_command};
use bit_install::{config::WorkspaceConfig, workspace::Workspace};
use serde_json::{Value, json};
use std::{fs, io, path::Path};
pub(super) fn read(root: &Path) -> io::Result<Value> {
    let bitmap = bit_object_import::parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    let mut engine = Engine::new()?;
    let context: Value = engine.request(&json!({"kind":"trackingContext","root":root,"home":workspace_command::home(),"bitmap":bitmap}))?;
    let config =
        WorkspaceConfig::from_value(root.join("workspace.jsonc"), context["workspace"].clone())?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))?;
    let workspace = Workspace::load_projected(root, &config, &core, &bitmap)?;
    let components = workspace.components.iter().map(|component| json!({
        "identity":component.id.to_string_without_version(),"version":component.id.version,
        "rootDir":component.root_dir,"directory":component.root_dir,"mainFile":component.main_file,
        "files":component.files,"sourceConfigs":component.config,"packageName":component.package_name,
    })).collect::<Vec<_>>();
    engine.validate_read_set(
        context["controlReadSet"]
            .as_array()
            .ok_or_else(|| io::Error::other("fork inventory control proofs"))?,
        "fork inventory changed",
    )?;
    Ok(json!({"bitmap":bitmap,"components":components,"workspace":context["workspace"]}))
}
pub(super) fn selected<'a>(inventory: &'a Value, source: &str) -> Option<&'a Value> {
    let source = source.trim();
    let (bare, explicit_ver) = source
        .rsplit_once('@')
        .map_or((source, None), |(id, ver)| (id.trim(), Some(ver.trim())));
    inventory["components"]
        .as_array()?
        .iter()
        .find(|row| matches_source_row(row, bare, explicit_ver))
}

fn matches_source_row(row: &Value, bare: &str, explicit_ver: Option<&str>) -> bool {
    let bare = bare.trim();
    if bare.is_empty() {
        return false;
    }
    let row_id = row["identity"]
        .as_str()
        .or_else(|| row["id"].as_str())
        .map(str::trim)
        .unwrap_or_default();
    let id_matches =
        row_id == bare || row_id.split_once('/').map(|(_, name)| name.trim()) == Some(bare);
    let ver_matches = explicit_ver.is_none_or(|ver| {
        !ver.is_empty()
            && (ver.eq_ignore_ascii_case("latest")
                || ver.eq_ignore_ascii_case("head")
                || row["version"].as_str().map(str::trim) == Some(ver))
    });
    id_matches && ver_matches
}
pub(super) fn default_scope(inventory: &Value) -> io::Result<String> {
    crate::commands::update_cmd::aspect_entry(
        &inventory["workspace"],
        "teambit.workspace/workspace",
    )
    .and_then(|(_, ws)| ws["defaultScope"].as_str())
    .map(str::trim)
    .filter(|scope| !scope.is_empty())
    .map(str::to_owned)
    .ok_or_else(|| io::Error::other("fork workspace defaultScope"))
}

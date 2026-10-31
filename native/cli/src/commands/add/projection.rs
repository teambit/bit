//! Project the retained add bitmap into the existing native component loader.
use bit_install::{config::WorkspaceConfig, model::WorkspaceComponent, workspace::Workspace};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) struct Projection {
    pub workspace: Workspace,
    pub context: Value,
    pub selected: Vec<Value>,
    pub components: Vec<Value>,
    pub load_error: Option<String>,
}

impl Projection {
    pub(super) fn loading_components(&self) -> Vec<Value> {
        self.selected
            .iter()
            .filter_map(|target| {
                self.components
                    .iter()
                    .find(|component| component["identity"] == target["identity"])
                    .cloned()
            })
            .collect()
    }
}

pub(super) fn prepare(
    root: &Path,
    bitmap: &Value,
    added: &[Value],
    context: Value,
) -> io::Result<Projection> {
    let config =
        WorkspaceConfig::from_value(root.join("workspace.jsonc"), context["workspace"].clone())?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))
    .map_err(io::Error::other)?;
    let workspace = Workspace::load_projected(root, &config, &core, bitmap)?;
    prepare_loaded(root, bitmap, added, context, workspace)
}

pub(super) fn prepare_loaded(
    root: &Path,
    bitmap: &Value,
    added: &[Value],
    mut context: Value,
    workspace: Workspace,
) -> io::Result<Projection> {
    let previous = context["targets"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let mut targets = workspace.components
        .iter()
        .map(|component| target(component, bitmap, added, &previous))
        .collect::<Vec<_>>();
    let load_error = controls(root, &mut targets, added)?;
    let selected = select(added, &targets);
    let components = components(&workspace, added);
    context["targets"] = json!(targets);
    Ok(Projection { workspace, context, selected, components, load_error })
}

fn target(
    component: &WorkspaceComponent,
    bitmap: &Value,
    added: &[Value],
    previous: &[Value],
) -> Value {
    let identity = component.id.to_string_without_version();
    let mut target = previous
        .iter()
        .find(|target| target["identity"] == identity)
        .cloned()
        .unwrap_or_else(|| json!({"config":null,"packageJson":null}));
    target["identity"] = json!(identity);
    target["directory"] = json!(component.root_dir);
    target["version"] = json!(component.id.version.as_deref().unwrap_or_default());
    tracking_version(&mut target, added);
    target["mainFile"] = json!(component.main_file);
    target["scoped"] = json!(component.id.scope.is_some());
    target["localOnly"] = json!(false);
    target["softTagged"] = json!(false);
    target["locallyRemoved"] = json!(false);
    target["componentConfig"] = bitmap
        .as_object()
        .and_then(|entries| {
            entries
                .values()
                .find(|entry| entry["rootDir"] == component.root_dir)
        })
        .and_then(|entry| entry.get("config"))
        .cloned()
        .unwrap_or(Value::Null);
    target
}

fn controls(root: &Path, targets: &mut [Value], added: &[Value]) -> io::Result<Option<String>> {
    let mut error = None;
    for target in targets {
        let directory = target["directory"]
            .as_str()
            .map(str::trim)
            .filter(|dir| !dir.is_empty())
            .ok_or_else(|| io::Error::other("tracking target directory"))?
            .to_owned();
        let config = optional_json(&root.join(&directory).join("component.json"))?;
        if malformed_selected(&config, target, added) {
            error = Some("Cannot read properties of undefined (reading 'scope')".to_owned());
        }
        target["config"] = component_config(config);
        target["packageJson"] = optional_json(&root.join(&directory).join("package.json"))?;
    }
    Ok(error)
}
fn malformed_selected(config: &Value, target: &Value, added: &[Value]) -> bool {
    let target_id = row_identity(target);
    !config.is_null()
        && config.get("componentId").is_none()
        && added
            .iter()
            .any(|row| {
                row_identity(row) == target_id
                    && (row["rootDir"].is_string() || row["directory"].is_string())
            })
}
fn select(added: &[Value], targets: &[Value]) -> Vec<Value> {
    added
        .iter()
        .filter(|row| {
            (row["rootDir"].is_string() || row["directory"].is_string())
                && row["files"]
                    .as_array()
                    .is_some_and(|files| !files.is_empty())
        })
        .filter_map(|row| {
            let row_id = row_identity(row)?;
            targets
                .iter()
                .find(|target| row_identity(target) == Some(row_id))
                .cloned()
        })
        .collect()
}
fn components(workspace: &Workspace, added: &[Value]) -> Vec<Value> {
    workspace.components.iter().map(|component|{
        let mut row=json!({"identity":component.id.to_string_without_version(),"directory":component.root_dir,"mainFile":component.main_file,"files":component.files.iter().map(|file|json!({"relativePath":file,"name":file.rsplit('/').next().unwrap_or(file),"test":false})).collect::<Vec<_>>()});
        tracking_version(&mut row,added);
        row
    }).collect()
}
fn tracking_version(row: &mut Value, added: &[Value]) {
    let row_id = row_identity(row).map(str::to_owned);
    if let Some(added) = added
        .iter()
        .find(|added| row_identity(added) == row_id.as_deref())
    {
        row["trackingVersion"] = added["loadVersion"].clone();
    }
}
fn row_identity(row: &Value) -> Option<&str> {
    row["identity"]
        .as_str()
        .or_else(|| row["id"].as_str())
        .map(str::trim)
        .map(|id| {
            id.split('@')
                .next()
                .unwrap_or(id)
                .trim()
        })
        .filter(|id| !id.is_empty())
}
fn optional_json(path: &Path) -> io::Result<Value> {
    match std::fs::read(path) {
        Ok(bytes) => bit_object_import::parse_jsonc(&bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Value::Null),
        Err(error) => Err(error),
    }
}
fn component_config(value: Value) -> Value {
    if value.is_null() {
        return value;
    }
    let mut result =
        json!({"extensions":value.get("extensions").cloned().unwrap_or_else(||json!({}))});
    if let Some(propagate) = value.get("propagate") {
        result["propagate"] = propagate.clone();
    }
    result
}

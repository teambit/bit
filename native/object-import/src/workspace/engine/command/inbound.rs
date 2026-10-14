//! Retained public inbound transfer. Prepare performs remote I/O and validates
//! the complete import without touching the user's repository; Apply publishes.

use super::{
    super::{client_status::config, invalid},
    State,
};
use crate::command_import::{self, Target, VirtualRemote};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::Digest;
use std::{
    io,
    path::{Path, PathBuf},
};
mod remote;
mod write;

#[cfg(test)]
mod protocol_tests;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Prepare {
    root: PathBuf,
    home: PathBuf,
    global_remotes_file: PathBuf,
    #[serde(default)]
    bitmap_history_file_id: Option<String>,
    operation: String,
    ids: Vec<String>,
    options: Options,
    #[serde(flatten)]
    transport: Transport,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Transport {
    global_config_dir: PathBuf,
    node_executable: PathBuf,
    /// The `@teambit/bit` package dir: a `resolverPath` resolves from its
    /// `@teambit/scope.remotes`, as in Bit.
    #[serde(default)]
    bit_dir: PathBuf,
    bit_version: String,
    #[serde(default)]
    token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Options {
    objects_only: bool,
    all_history: bool,
    from_original_scope: bool,
    skip_dependency_installation: bool,
    lanes: bool,
    components: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Apply {
    token: String,
}

pub(super) struct Retained {
    token: String,
    receipt: Value,
    import: command_import::PreparedImport,
    workspace: Option<write::Prepared>,
}

pub(in crate::workspace::engine) fn prepare(
    input: &Prepare,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    state.inbound = None;
    validate(input)?;
    let targets = targets(input)?;
    let virtual_remotes = remote::objects(input, &targets)?;
    let import = command_import::prepare_with_virtual(
        &input.root,
        &input.global_remotes_file,
        &targets,
        &virtual_remotes,
    )?;
    let workspace = if input.options.objects_only {
        None
    } else {
        Some(write::prepare(
            &input.root,
            &targets,
            &import,
            input.bitmap_history_file_id.as_deref(),
        )?)
    };
    state.sequence = state.sequence.wrapping_add(1);
    let token = format!("inbound-{}", state.sequence);
    let receipt = receipt(&input.root, &targets, &import, &token)?;
    let count = targets.len();
    state.inbound = Some(Retained { token, receipt: receipt.clone(), import, workspace });
    Ok((count, receipt))
}

fn receipt(
    root: &Path,
    targets: &[Target],
    import: &command_import::PreparedImport,
    token: &str,
) -> io::Result<Value> {
    let imported_ids = targets
        .iter()
        .map(|target| imported_identity(target, import))
        .collect::<io::Result<Vec<_>>>()?;
    let details = details(root, targets, import)?;
    let progress = import.progress
        .iter()
        .map(|row| {
            json!({
                "reason":row.reason,"ids":row.ids,
                "components":row.components.len(),"objects":row.objects.len(),
                "objectRequest":row.object_request,
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "token":token,"owner":"rust","importedIds":imported_ids,
        "importDetails":details,"progress":progress,
    }))
}

pub(in crate::workspace::engine) fn apply(
    input: &Apply,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained = state.inbound.take().ok_or_else(|| invalid("inbound owner missing"))?;
    if input.token != retained.token {
        return Err(invalid("inbound owner token"));
    }
    retained.import.commit()?;
    if let Some(workspace) = retained.workspace {
        workspace.commit()?;
    }
    let mut receipt = retained.receipt;
    receipt["applied"] = json!(true);
    let count = receipt["importedIds"].as_array().map_or(0, Vec::len);
    Ok((count, receipt))
}

fn validate(input: &Prepare) -> io::Result<()> {
    for path in
        [&input.root, &input.home, &input.global_remotes_file, &input.transport.global_config_dir]
    {
        super::super::path(path)?;
    }
    if !input.transport.node_executable.is_absolute()
        || input.transport.bit_version.is_empty()
        || input.ids.len() > 4096
    {
        return Err(invalid("inbound command requires canonical lifecycle"));
    }
    if input.options.lanes || input.options.from_original_scope || !valid_operation(input) {
        return Err(invalid("inbound command requires canonical lifecycle"));
    }
    if !valid_write_mode(input) || input.root.join(".bitTmp").try_exists()? {
        return Err(invalid("inbound command requires canonical lifecycle"));
    }
    Ok(())
}
fn valid_operation(input: &Prepare) -> bool {
    match input.operation.as_str() {
        "fetch" => input.options.components && input.options.objects_only,
        "import" => !input.options.components,
        _ => false,
    }
}
fn valid_write_mode(input: &Prepare) -> bool {
    if input.options.objects_only {
        !input.options.skip_dependency_installation
            && input.bitmap_history_file_id.is_none()
    } else {
        input.options.skip_dependency_installation
            && input.bitmap_history_file_id.is_some()
    }
}

fn targets(input: &Prepare) -> io::Result<Vec<Target>> {
    if input.ids.is_empty() {
        return bitmap_targets(&input.root);
    }
    input.ids
        .iter()
        .map(|id| requested_target(id))
        .collect()
}
fn bitmap_targets(root: &Path) -> io::Result<Vec<Target>> {
    let bitmap = config::document(&root.join(".bitmap"))?;
    let rows = bitmap.as_object().ok_or_else(|| invalid("inbound bitmap"))?;
    let mut targets = Vec::new();
    for (key, row) in rows {
        if key == "$schema-version" {
            continue;
        }
        let Some(scope) = row["scope"]
            .as_str()
            .filter(|scope| !scope.is_empty())
        else {
            continue;
        };
        let name = row["name"].as_str().ok_or_else(|| invalid("inbound bitmap name"))?;
        let version = row["version"].as_str().ok_or_else(|| invalid("inbound bitmap version"))?;
        targets.push(Target {
            scope: Some(scope.to_owned()),
            name: name.to_owned(),
            version: version.to_owned(),
        });
    }
    Ok(targets)
}
fn requested_target(id: &str) -> io::Result<Target> {
    let (scope, rest) = id.split_once('/').ok_or_else(|| invalid("inbound unscoped id"))?;
    let (name, version) = rest
        .rsplit_once('@')
        .unwrap_or((rest, "latest"));
    if scope.is_empty() || name.is_empty() || name.contains('*') || version.is_empty() {
        return Err(invalid("inbound unsupported id"));
    }
    Ok(Target { scope: Some(scope.to_owned()), name: name.to_owned(), version: version.to_owned() })
}

fn identity(target: &Target) -> io::Result<String> {
    let scope = target.scope.as_deref().ok_or_else(|| invalid("inbound scope"))?;
    Ok(format!("{scope}/{}@{}", target.name, target.version))
}

fn imported_identity(
    target: &Target,
    imported: &command_import::PreparedImport,
) -> io::Result<String> {
    let scope = target.scope.as_deref().ok_or_else(|| invalid("inbound target scope"))?;
    let model = imported.overlay
        .models()
        .into_iter()
        .find(|model| model["scope"] == scope && model["name"] == target.name)
        .ok_or_else(|| invalid("inbound imported model"))?;
    let version = if target.version == "latest" {
        head_as_tag_or_hash(model)?
    } else {
        target.version.clone()
    };
    Ok(format!("{scope}/{}@{version}", target.name))
}

fn head_as_tag_or_hash(model: &Value) -> io::Result<String> {
    let head = model["head"].as_str().ok_or_else(|| invalid("inbound model head"))?;
    Ok(model["versions"]
        .as_object()
        .and_then(|versions| {
            versions
                .iter()
                .rev()
                .find(|(_, hash)| hash.as_str() == Some(head))
        })
        .map_or_else(|| head.to_owned(), |(tag, _)| tag.clone()))
}

fn details(
    root: &Path,
    targets: &[Target],
    imported: &command_import::PreparedImport,
) -> io::Result<Vec<Value>> {
    let models = imported.overlay.models();
    targets.iter().map(|target| {
        let scope = target.scope.as_deref().ok_or_else(|| invalid("inbound scope"))?;
        let model = models.iter().copied().find(|model| model["scope"] == scope && model["name"] == target.name)
            .ok_or_else(|| invalid("inbound imported model absent"))?;
        let id = format!("{scope}/{}", target.name);
        let versions = model["versions"].as_object().ok_or_else(|| invalid("inbound versions"))?;
        let previous = previous_versions(root, scope, &target.name)?;
        let added = versions.keys().filter(|key| !previous.contains(*key)).cloned().collect::<Vec<_>>();
        let status = if added.is_empty() { "up to date" } else if previous.is_empty() { "added" } else { "updated" };
        let head = head_as_tag_or_hash(model)?;
        let latest = added.contains(&head).then_some(head);
        Ok(json!({"id":id,"versions":added,"latestVersion":latest,"status":status,
            "filesStatus":null,"missingDeps":[],"deprecated":model["deprecated"] == true,"removed":false}))
    }).collect()
}

fn previous_versions(root: &Path, scope: &str, name: &str) -> io::Result<Vec<String>> {
    let hash =
        crate::validate::hexadecimal(&sha1::Sha1::digest(format!("{scope}/{name}").as_bytes()));
    let directory = root.join(".bit/objects");
    let mut total = 0;
    let raw = match crate::checkout::repository::read(
        &directory,
        crate::merge_history::hash(&hash)?,
        32 * 1024 * 1024,
        &mut total,
    ) {
        Ok(raw) => raw,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let (_, body) =
        crate::checkout::repository::split(&raw, crate::merge_history::hash(&hash)?, "Component")?;
    let model: Value = serde_json::from_slice(body).map_err(io::Error::other)?;
    Ok(model["versions"]
        .as_object()
        .map_or_else(Vec::new, |versions| versions.keys().cloned().collect()))
}

//! `WorkspaceConfig.create`: the installed template and native comment-preserving edits.
use super::options::Options;
use bit_workspace_config::jsonc::Document;
use serde_json::{Value, json};
use std::{fs, io, path::Path};

const WORKSPACE: &str = "teambit.workspace/workspace";
const RESOLVER: &str = "teambit.dependencies/dependency-resolver";

pub(super) fn create(root: &Path, modules: &Path, options: &Options) -> io::Result<Vec<u8>> {
    let mut document = template(modules)?;
    let name = options.defaults.name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map_or_else(
            || {
                root.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned()
            },
            str::to_owned,
        );
    document.set(&[WORKSPACE, "name"], &json!(name));
    if let Some(value) = options.defaults.directory
        .as_deref()
        .map(str::trim)
        .filter(|val| !val.is_empty())
    {
        document.set(&[WORKSPACE, "defaultDirectory"], &json!(value));
    }
    if let Some(value) = options.defaults.scope
        .as_deref()
        .map(str::trim)
        .filter(|val| !val.is_empty())
    {
        document.set(&[WORKSPACE, "defaultScope"], &json!(value));
    }
    if let Some(value) = &options.defaults.generator {
        document.set(
            &["teambit.generator/generator"],
            &json!({"envs": parse_generator_envs(value)}),
        );
    }
    configure(&mut document, options);
    Ok(render(&document))
}

fn parse_generator_envs(value: &str) -> Vec<&str> {
    value
        .split(',')
        .map(str::trim)
        .filter(|env| !env.is_empty())
        .collect()
}

pub(super) fn existing(path: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(Some(render(&Document::parse(&text)?))),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

pub(super) fn workspace_files(bytes: Vec<u8>, options: &Options) -> io::Result<Vec<u8>> {
    if !options.flags.external_pm
        && !options.defaults.directory
            .as_deref()
            .is_some_and(|value| value.starts_with("bit-components"))
    {
        return Ok(bytes);
    }
    let mut document = Document::parse(std::str::from_utf8(&bytes).map_err(io::Error::other)?)?;
    document.set(
        &["teambit.workspace/workspace-config-files"],
        &json!({"enableWorkspaceConfigWrite":true,"useDefaultDirectory":true}),
    );
    Ok(render(&document))
}

// WorkspaceConfig.toVinyl is persisted through AbstractVinyl's platform EOL conversion.
fn render(document: &Document) -> Vec<u8> {
    let text = format!("{document}\n").replace("\r\n", "\n").replace('\r', "\n");
    if cfg!(windows) { text.replace('\n', "\r\n").into_bytes() } else { text.into_bytes() }
}

fn template(modules: &Path) -> io::Result<Document> {
    let text = fs::read_to_string(modules.join("config/dist/workspace-template.jsonc"))
        .or_else(|error| {
            if error.kind() == io::ErrorKind::NotFound {
                fs::read_to_string(modules.join("config/workspace-template.jsonc"))
            } else {
                Err(error)
            }
        })?;
    Document::parse(&text)
}

fn configure(document: &mut Document, options: &Options) {
    if options.flags.external_pm {
        document.set(&[RESOLVER, "externalPackageManager"], &Value::Bool(true));
        document.set(&[RESOLVER, "rootComponent"], &Value::Bool(false));
        document.set(&[WORKSPACE, "defaultDirectory"], &json!("bit-components/{scope}/{name}"));
    }
    if options.flags.external_pm
        || options.defaults.directory
            .as_deref()
            .is_some_and(|value| value.starts_with("bit-components"))
    {
        document.set(
            &["teambit.workspace/workspace-config-files"],
            &json!({"enableWorkspaceConfigWrite":true,"useDefaultDirectory":true}),
        );
    }
}

//! External package manager mode: `handleExternalPackageManagerPrompt`,
//! `disableExternalPackageManagerMode` and `writeDependenciesToPackageJson` of
//! `install.main.runtime.ts`.

#[cfg(test)]
mod tests;

use super::{
    calculate,
    session::{Loaded, Session},
    workspace_jsonc,
};
use crate::{
    config::{DEPENDENCY_RESOLVER_ASPECT, WORKSPACE_CONFIG_FILES_ASPECT},
    jsonc::Document,
    model::DependencyMap,
    output::Style,
};
use bit_workspace_config::package_json::{detect_indent, detect_newline, stringify_package};
use serde_json::{Map, Value, json};
use std::{fs, io, path::Path};

/// `EXTERNAL_PM_POSTINSTALL_SCRIPT` (`create-consumer.ts`).
const POSTINSTALL: &str = "bit link && bit compile && bit ws-config write";
const DECLINED: &str = r#"External package manager mode is enabled. Please use your preferred package manager (npm, yarn, pnpm) to install dependencies instead of "bit install"."#;
const SKIPPED: &str = "Installation was skipped due to external package manager configuration. Please run your package manager to install dependencies.";

/// `InstallMain.install` without `showExternalPackageManagerPrompt`: the root
/// manifest's dependencies go to the root `package.json`, and nothing is installed.
pub async fn write_dependencies(session: &Session<'_>, loaded: &Loaded) -> io::Result<()> {
    let calculated = calculate::package_json_dependencies(session, loaded).await?;
    for warning in &calculated.warnings {
        session.output.warning(warning);
    }
    for message in &calculated.messages {
        session.output.console(message);
    }
    write_package_json_dependencies(&session.root, &calculated.dependencies)?;
    session.output.console(&session.output.paint(Style::Yellow, SKIPPED));
    Ok(())
}

/// `workspace.writeDependenciesToPackageJson(dependencies)`: each one is set in
/// `dependencies` (created when missing), keeping the file's indentation and newlines
/// (`PackageJsonFile.load` and `write`).
fn write_package_json_dependencies(root: &Path, dependencies: &DependencyMap) -> io::Result<()> {
    let path = root.join("package.json");
    let (text, mut manifest) = load_package_json(&path)?;
    let Some(object) = manifest.as_object_mut() else {
        return Err(io::Error::other("package.json must hold an object"));
    };
    let field = object.entry("dependencies").or_insert(Value::Null);
    if field.is_null() {
        *field = Value::Object(Map::new());
    }
    let Some(field) = field.as_object_mut() else {
        return Err(io::Error::other(r#"package.json "dependencies" must be an object"#));
    };
    for (name, range) in dependencies {
        let (name, range) = (name.trim(), range.trim());
        if !name.is_empty() && !range.is_empty() {
            field.insert(name.to_owned(), Value::String(range.to_owned()));
        }
    }
    fs::write(&path, stringify_package(&manifest, &detect_indent(&text), detect_newline(&text))?)
}

fn load_package_json(path: &Path) -> io::Result<(String, Value)> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error),
    };
    let manifest = if text.is_empty() {
        Value::Object(Map::new())
    } else {
        crate::jsonc::parse(&text)
            .map_err(|error| {
                io::Error::other(format!(
                    "failed parsing package.json file at . original error: {error}",
                ))
            })?
    };
    Ok((text, manifest))
}

/// Ask whether to switch to Bit's package manager; switch or fail.
pub async fn switch(session: &Session<'_>, loaded: &Loaded) -> io::Result<()> {
    let output = &session.output;
    output.stop();
    output.console(&output.paint(Style::Cyan, "\n📦 External Package Manager Mode Detected"));
    output.console(&gray(
        output,
        "Your workspace is configured to use external package managers (npm, yarn, pnpm).",
    ));
    output.console(&gray(output, "Running \"bit install\" is not available in this mode.\n"));
    let question = output.paint(
        Style::Bold,
        "Would you like to switch to Bit's package manager for dependency management? [yes(y)/no(n)]",
    );
    if !session.host.confirm(&question).await? {
        return Err(io::Error::other(DECLINED));
    }
    if let Err(error) = disable(session, loaded) {
        output.console(&output.paint(Style::Red, "✗ Failed to switch to Bit package manager mode"));
        return Err(error);
    }
    output.console(&output.paint(
        Style::Green,
        "✓ Successfully switched to Bit package manager mode",
    ));
    Ok(())
}

fn gray(output: &crate::output::Output, text: &str) -> String {
    output.paint(Style::Gray, text)
}

fn disable(session: &Session<'_>, loaded: &Loaded) -> io::Result<()> {
    if remove_postinstall_script(&session.root).is_err() {
        let warning = "⚠ Warning: Could not remove postInstall script from package.json";
        session.output.console(&session.output.paint(Style::Yellow, warning));
    }
    workspace_jsonc::edit(
        &session.root,
        &loaded.workspace.scope_path,
        &session.info.file_id,
        "",
        disable_in_config,
    )
}

fn disable_in_config(document: &mut Document) {
    if document
        .get(&[DEPENDENCY_RESOLVER_ASPECT])
        .is_some()
    {
        document.remove(&[DEPENDENCY_RESOLVER_ASPECT, "externalPackageManager"]);
        document.set(&[DEPENDENCY_RESOLVER_ASPECT, "rootComponent"], &json!(true));
    }
    if document
        .get(&[WORKSPACE_CONFIG_FILES_ASPECT])
        .is_some()
    {
        document.set(&[WORKSPACE_CONFIG_FILES_ASPECT, "enableWorkspaceConfigWrite"], &json!(true));
    }
}

/// `removePostInstallScript`: only Bit's own postinstall script goes.
fn remove_postinstall_script(root: &Path) -> io::Result<()> {
    let path = root.join("package.json");
    let Ok(text) = fs::read_to_string(&path) else { return Ok(()) };
    let mut manifest: Value = crate::jsonc::parse(&text).map_err(io::Error::other)?;
    let Some(scripts) = manifest.get_mut("scripts").and_then(Value::as_object_mut) else {
        return Ok(());
    };
    if scripts
        .get("postinstall")
        .and_then(Value::as_str)
        .map(str::trim)
        != Some(POSTINSTALL)
    {
        return Ok(());
    }
    scripts.remove("postinstall");
    if scripts.is_empty() {
        manifest
            .as_object_mut()
            .map(|object| object.remove("scripts"));
    }
    let mut written = serde_json::to_string_pretty(&manifest).map_err(io::Error::other)?;
    written.push('\n');
    fs::write(&path, written)
}

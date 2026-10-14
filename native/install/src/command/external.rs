//! External package manager mode: `handleExternalPackageManagerPrompt` and
//! `disableExternalPackageManagerMode` of `install.main.runtime.ts`.

use super::{
    session::{Loaded, Session},
    workspace_jsonc,
};
use crate::{
    config::{DEPENDENCY_RESOLVER_ASPECT, WORKSPACE_CONFIG_FILES_ASPECT},
    jsonc::Document,
    output::Style,
};
use serde_json::{Value, json};
use std::{fs, io, path::Path};

/// `EXTERNAL_PM_POSTINSTALL_SCRIPT` (`create-consumer.ts`).
const POSTINSTALL: &str = "bit link && bit compile && bit ws-config write";
const DECLINED: &str = r#"External package manager mode is enabled. Please use your preferred package manager (npm, yarn, pnpm) to install dependencies instead of "bit install"."#;

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
    let mut manifest: Value = serde_json::from_str(&text).map_err(io::Error::other)?;
    let Some(scripts) = manifest.get_mut("scripts").and_then(Value::as_object_mut) else {
        return Ok(());
    };
    if scripts.get("postinstall").and_then(Value::as_str) != Some(POSTINSTALL) {
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

#[cfg(test)]
mod tests;

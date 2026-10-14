//! External package manager mode: `handleExternalPackageManagerPrompt`,
//! `disableExternalPackageManagerMode` and `writeDependenciesToPackageJson` of
//! `install.main.runtime.ts`.

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
use serde::Serialize;
use serde_json::{Map, Value, json, ser::PrettyFormatter};
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
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error),
    };
    let mut manifest = if text.is_empty() {
        Value::Object(Map::new())
    } else {
        serde_json::from_str(&text)
            .map_err(|error| {
                io::Error::other(format!(
                    "failed parsing package.json file at . original error: {error}",
                ))
            })?
    };
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
        field.insert(name.clone(), Value::String(range.clone()));
    }
    fs::write(&path, stringify_package(&manifest, &detect_indent(&text), detect_newline(&text))?)
}

/// `stringify-package`: `JSON.stringify` with the indentation (two spaces when
/// none was detected) and a final newline, CRLF throughout for CRLF files.
fn stringify_package(value: &Value, indent: &str, newline: Option<&str>) -> io::Result<String> {
    // `JSON.stringify` uses at most ten characters of a string indent.
    let indent: String =
        if indent.is_empty() { "  ".to_string() } else { indent.chars().take(10).collect() };
    let mut bytes = Vec::new();
    let mut serializer = serde_json::Serializer::with_formatter(
        &mut bytes,
        PrettyFormatter::with_indent(indent.as_bytes()),
    );
    value.serialize(&mut serializer).map_err(io::Error::other)?;
    let json = String::from_utf8(bytes).map_err(io::Error::other)?;
    Ok(if newline == Some("\r\n") {
        format!("{}\r\n", json.replace('\n', "\r\n"))
    } else {
        format!("{json}\n")
    })
}

/// `detect-newline` 3: the more frequent of CRLF and LF, `None` without newlines.
fn detect_newline(text: &str) -> Option<&'static str> {
    let total = text.matches('\n').count();
    if total == 0 {
        return None;
    }
    let crlf = text.matches("\r\n").count();
    Some(if crlf > total - crlf { "\r\n" } else { "\n" })
}

/// `detect-indent` 5: the most used indentation step (ties go to the step more
/// lines follow), as spaces unless more lines are indented with tabs; empty when
/// nothing is indented.
fn detect_indent(text: &str) -> String {
    let mut steps = IndentSteps::default();
    let (mut tabs, mut spaces) = (0_usize, 0_usize);
    for line in text
        .split('\n')
        .filter(|line| !line.is_empty())
    {
        let width = match leading(line) {
            Leading::Spaces(width) => {
                spaces += 1;
                width
            }
            Leading::Tabs(width) => {
                tabs += 1;
                width
            }
            Leading::None => 0,
        };
        steps.line(i64::try_from(width).unwrap_or(i64::MAX));
    }
    let amount = steps.most_used();
    if amount == 0 {
        String::new()
    } else if spaces >= tabs {
        " ".repeat(amount)
    } else {
        "\t".repeat(amount)
    }
}

/// `/^(?:( )+|\t+)/`: a run of spaces or a run of tabs, not both.
enum Leading {
    Spaces(usize),
    Tabs(usize),
    None,
}

fn leading(line: &str) -> Leading {
    let run = |character: char| line.len() - line.trim_start_matches(character).len();
    if line.starts_with(' ') {
        Leading::Spaces(run(' '))
    } else if line.starts_with('\t') {
        Leading::Tabs(run('\t'))
    } else {
        Leading::None
    }
}

/// The `indents` map of `detect-indent` 5, in insertion order: each step (signed
/// as first set) with its uses and the lines that follow it as an indent.
#[derive(Default)]
struct IndentSteps {
    previous: i64,
    entries: Vec<(i64, [u64; 2])>,
    current: Option<usize>,
    is_indent: bool,
}

impl IndentSteps {
    fn line(&mut self, indent: i64) {
        let diff = indent - self.previous;
        self.previous = indent;
        if diff == 0 {
            if let Some(found) = self.current {
                self.entries[found].1[1] += u64::from(self.is_indent);
            }
            return;
        }
        self.is_indent = diff > 0;
        self.current = Some(self.step(diff));
    }

    /// `indents.get(|diff|)` gets one more use; otherwise `indents.set(diff, [1, 0])`,
    /// which replaces an earlier unindent entry in place.
    fn step(&mut self, diff: i64) -> usize {
        if let Some(found) = self.position(diff.abs()) {
            self.entries[found].1[0] += 1;
            return found;
        }
        if let Some(found) = self.position(diff) {
            self.entries[found].1 = [1, 0];
            return found;
        }
        self.entries.push((diff, [1, 0]));
        self.entries.len() - 1
    }

    fn position(&self, step: i64) -> Option<usize> {
        self.entries
            .iter()
            .position(|(existing, _)| *existing == step)
    }

    /// `getMostUsed`: the first step with the most uses, then the most weight.
    fn most_used(&self) -> usize {
        let (mut amount, mut max_used, mut max_weight) = (0_i64, 0_u64, 0_u64);
        for (step, [used, weight]) in &self.entries {
            if *used > max_used || (*used == max_used && *weight > max_weight) {
                (amount, max_used, max_weight) = (*step, *used, *weight);
            }
        }
        usize::try_from(amount).unwrap_or(0)
    }
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

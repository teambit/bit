//! Best-effort agent instructions and Cloud MCP files written only for new workspaces.
//!
//! [`Assets`] ([`Assets::prepare`], [`Assets::write`]) stages auxiliary [`agent`] and [`mcp`] files into [`Plan`] according to [`Options`].
use super::{options::Options, plan::Plan};
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Staged optional AI agent instructions and MCP configuration files for a newly initialized workspace.
#[derive(Default)]
pub(super) struct Assets {
    agent: Option<(PathBuf, Vec<u8>)>,
    mcp: Option<(PathBuf, Vec<u8>)>,
}
impl Assets {
    /// Prepares optional agent and MCP files when `plan.created` is true and `--bare` is not set.
    #[inline]
    pub(super) fn prepare(plan: &Plan, options: &Options) -> io::Result<Self> {
        if !plan.created || options.bare.is_some() {
            return Ok(Self::default());
        }
        Ok(Self { agent: agent(plan, options)?, mcp: mcp(&plan.root).ok() })
    }
    /// Writes prepared agent and MCP files under `root` and returns their relative paths when written.
    #[inline]
    pub(super) fn write(self, root: &Path) -> (Option<String>, Option<String>) {
        (write(root, self.agent), write(root, self.mcp))
    }
}
/// Writes a single staged `(path, bytes)` asset under `root` and returns its relative path string on success.
#[inline]
fn write(root: &Path, file: Option<(PathBuf, Vec<u8>)>) -> Option<String> {
    let (path, bytes) = file?;
    let relative = path.to_string_lossy().into_owned();
    let path = root.join(path);
    if fs::symlink_metadata(&path).is_ok_and(|meta| meta.file_type().is_symlink()) {
        return None;
    }
    if let Some(parent) = path
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
    {
        fs::create_dir_all(parent).ok()?;
    }
    fs::write(&path, bytes).ok()?;
    Some(relative)
}
/// Resolves and renders the optional AI agent instructions file from `plan` and `options`.
#[inline]
fn agent(plan: &Plan, options: &Options) -> io::Result<Option<(PathBuf, Vec<u8>)>> {
    let raw_agent = options.agent.as_deref().map(str::trim);
    let name = match raw_agent {
        None | Some("") => "AGENTS.md",
        Some(val) if val.eq_ignore_ascii_case("claude") => "CLAUDE.md",
        Some(val) if val.eq_ignore_ascii_case("cursor") => ".cursor/rules/bit.mdc",
        Some(val) if val.eq_ignore_ascii_case("copilot") => ".github/copilot-instructions.md",
        Some(value) => {
            return Err(io::Error::other(format!(
                r#"unknown --agent value "{value}". supported values: claude, cursor, copilot"#,
            )));
        }
    };
    if plan.git
        || [
            "AGENTS.md",
            "CLAUDE.md",
            ".cursorrules",
            ".cursor/rules",
            ".github/copilot-instructions.md",
        ]
        .iter()
        .any(|path| fs::symlink_metadata(plan.root.join(path)).is_ok())
    {
        return Ok(None);
    }
    let Ok(bytes) = fs::read(plan.modules.join("host-initializer/dist/agents-template.md")) else {
        return Ok(None);
    };
    let content = if name.ends_with(".mdc") {
        let header = b"---\ndescription: Bit workspace instructions\nalwaysApply: true\n---\n\n";
        let mut buf = Vec::with_capacity(header.len() + bytes.len());
        buf.extend_from_slice(header);
        buf.extend_from_slice(&bytes);
        buf
    } else {
        bytes
    };
    Ok(Some((PathBuf::from(name), content)))
}
/// Prepares the `.mcp.json` configuration file in `root` with the `bit` MCP server entry.
#[inline]
fn mcp(root: &Path) -> io::Result<(PathBuf, Vec<u8>)> {
    let path = root.join(".mcp.json");
    let mut value = fs::read(&path)
        .ok()
        .and_then(|bytes| bit_object_import::parse_jsonc(&bytes).ok())
        .filter(|val| !val.is_null())
        .unwrap_or_else(|| json!({}));
    if !value.is_array() {
        let object = value.as_object_mut().ok_or_else(|| io::Error::other("MCP object"))?;
        let servers = object.entry("mcpServers").or_insert(Value::Null);
        if !bit_workspace_config::truthy(servers) {
            *servers = json!({});
        }
        if !servers.is_array() {
            let servers =
                servers.as_object_mut().ok_or_else(|| io::Error::other("MCP servers object"))?;
            servers.insert(
                "bit-cloud".to_owned(),
                json!({"type":"http","url":"https://mcp.bit.cloud/mcp"}),
            );
        }
    }
    Ok((PathBuf::from(".mcp.json"), serde_json::to_vec_pretty(&value)?))
}

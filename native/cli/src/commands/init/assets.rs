//! Best-effort agent instructions and Cloud MCP files written only for new workspaces.
use super::{options::Options, plan::Plan};
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Default)]
pub(super) struct Assets {
    agent: Option<(PathBuf, Vec<u8>)>,
    mcp: Option<(PathBuf, Vec<u8>)>,
}
impl Assets {
    pub(super) fn prepare(plan: &Plan, options: &Options) -> io::Result<Self> {
        if !plan.created || options.bare.is_some() {
            return Ok(Self::default());
        }
        Ok(Self { agent: agent(plan, options)?, mcp: mcp(&plan.root).ok() })
    }
    pub(super) fn write(self, root: &Path) -> (Option<String>, Option<String>) {
        (write(root, self.agent), write(root, self.mcp))
    }
}
fn write(root: &Path, file: Option<(PathBuf, Vec<u8>)>) -> Option<String> {
    let (path, bytes) = file?;
    let relative = path.to_string_lossy().into_owned();
    let path = root.join(path);
    let parent = path.parent()?;
    fs::create_dir_all(parent).ok()?;
    fs::write(&path, bytes).ok()?;
    Some(relative)
}
fn agent(plan: &Plan, options: &Options) -> io::Result<Option<(PathBuf, Vec<u8>)>> {
    let name = match options.agent.as_deref() {
        None | Some("") => "AGENTS.md",
        Some("claude") => "CLAUDE.md",
        Some("cursor") => ".cursor/rules/bit.mdc",
        Some("copilot") => ".github/copilot-instructions.md",
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
        .any(|path| plan.root.join(path).exists())
    {
        return Ok(None);
    }
    let Ok(bytes) = fs::read(plan.modules.join("host-initializer/dist/agents-template.md")) else {
        return Ok(None);
    };
    let mut content = if name.ends_with(".mdc") {
        b"---\ndescription: Bit workspace instructions\nalwaysApply: true\n---\n\n".to_vec()
    } else {
        Vec::new()
    };
    content.extend(bytes);
    Ok(Some((PathBuf::from(name), content)))
}
fn mcp(root: &Path) -> io::Result<(PathBuf, Vec<u8>)> {
    let path = root.join(".mcp.json");
    let mut value = fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
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

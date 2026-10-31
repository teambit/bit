use super::editor_display_name;
use crate::commands::{color::Chalk, workspace_command};
use std::{
    env, fs,
    path::{Path, PathBuf},
};

const RULES_EDITORS: &[&str] = &["vscode", "cursor", "roo", "cline", "claude-code"];

const TEMPLATE_CONSUMER: &str =
    include_str!("../../../../../components/mcp/mcp-config-writer/bit-rules-consumer-template.md");
const TEMPLATE_GIT: &str =
    include_str!("../../../../../components/mcp/mcp-config-writer/bit-git-rules-template.md");
const TEMPLATE_STANDARD: &str =
    include_str!("../../../../../components/mcp/mcp-config-writer/bit-rules-template.md");

const WINDSURF_WARNING: &str = "\u{26a0}\u{fe0f}  Windsurf uses a single-file configuration (.windsurfrules) that is complex to manage automatically.\nPlease use --print flag to get the rules content and manually add it to your .windsurfrules file.";

const CLAUDE_CODE_PREAMBLE: &str = "<!--\nTo use these Bit instructions, add the following to your main CLAUDE.md file:\n\n@.claude/bit.md\n\nThis will automatically include all Bit-specific instructions in your Claude Code context.\n-->\n\n";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::commands) struct RulesOptions {
    pub editor: String,
    pub is_global: bool,
    pub should_print: bool,
    pub consumer_project: bool,
    pub force_standard: bool,
}

pub(super) fn parse_rules(rest: &[&str]) -> Option<RulesOptions> {
    let mut editor = None;
    let mut is_global = false;
    let mut should_print = false;
    let mut consumer_project = false;
    let mut force_standard = false;
    let mut iter = rest.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                crate::commands::internalize::consume_trailing_internalize(iter, &mut editor)?;
                break;
            }
            "-g" | "--global" | "--global=true" => is_global = true,
            "--global=false" => is_global = false,
            "-p" | "--print" | "--print=true" => should_print = true,
            "--print=false" => should_print = false,
            "-gp" | "-pg" => {
                is_global = true;
                should_print = true;
            }
            "--consumer-project" | "--consumer-project=true" => consumer_project = true,
            "--consumer-project=false" => consumer_project = false,
            "--force-standard" | "--force-standard=true" => force_standard = true,
            "--force-standard=false" => force_standard = false,
            val if !val.starts_with('-') && !val.trim().is_empty() && editor.is_none() => {
                editor = Some(val.trim().to_owned());
            }
            _ => return None,
        }
    }
    Some(RulesOptions {
        editor: editor.unwrap_or_else(|| "vscode".into()),
        is_global,
        should_print,
        consumer_project,
        force_standard,
    })
}

pub(super) fn execute_rules(cwd: &Path, opts: &RulesOptions, chalk: Chalk) -> String {
    if opts.editor.trim().eq_ignore_ascii_case("windsurf") && !opts.should_print {
        return chalk.yellow(WINDSURF_WARNING);
    }
    let base_content = default_rules_content(cwd, opts.consumer_project, opts.force_standard);
    if opts.should_print {
        return base_content.to_owned();
    }
    let editor_name = editor_display_name(&opts.editor);
    match write_rules_file(cwd, opts, base_content) {
        Ok(rules_path) => format_rules_success(opts, editor_name, &rules_path, chalk),
        Err(err_msg) => chalk.red(&format!("Error writing {editor_name} rules file: {err_msg}")),
    }
}

fn default_rules_content(cwd: &Path, consumer_project: bool, force_standard: bool) -> &'static str {
    if consumer_project {
        TEMPLATE_CONSUMER
    } else if !force_standard && cwd.join(".git").exists() {
        TEMPLATE_GIT
    } else {
        TEMPLATE_STANDARD
    }
}

fn write_rules_file(cwd: &Path, opts: &RulesOptions, base: &str) -> Result<PathBuf, String> {
    let editor_trimmed = opts.editor.trim();
    let editor_lower = editor_trimmed.to_ascii_lowercase();
    if !RULES_EDITORS.contains(&editor_lower.as_str()) {
        return Err(format!(
            r#"Editor "{editor_trimmed}" is not supported yet. Currently supported: {}"#,
            RULES_EDITORS.join(", "),
        ));
    }
    let (path, content) = match editor_lower.as_str() {
        "vscode" => (
            vscode_prompts_path(opts.is_global, cwd)?,
            format!("---\napplyTo: '**'\n---\n\n{base}"),
        ),
        "cursor" => (
            cursor_prompts_path(opts.is_global, cwd)?,
            format!(
                "---\ndescription: Bit MCP Agent Instructions\nalwaysApply: true\n---\n\n{base}",
            ),
        ),
        "roo" => (roo_prompts_path(opts.is_global, cwd), base.to_owned()),
        "cline" => (
            cline_prompts_path(opts.is_global, cwd)?,
            format!(
                "---\ndescription: Bit MCP Agent Instructions\ntags: [\"bit\", \"mcp\", \"component-development\"]\n---\n\n{base}",
            ),
        ),
        _ => {
            (claude_code_prompts_path(opts.is_global, cwd), format!("{CLAUDE_CODE_PREAMBLE}{base}"))
        }
    };
    if let Some(parent) = path
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
    {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    fs::write(&path, content).map_err(|err| err.to_string())?;
    Ok(path)
}

fn format_rules_success(
    opts: &RulesOptions,
    editor_name: &str,
    rules_path: &Path,
    chalk: Chalk,
) -> String {
    let scope = if opts.is_global { "global" } else { "workspace" };
    if opts.editor.eq_ignore_ascii_case("claude-code") {
        let file_path = if opts.is_global { "~/.claude/bit.md" } else { ".claude/bit.md" };
        let at_syntax = if opts.is_global { "@~/.claude/bit.md" } else { "@.claude/bit.md" };
        let text = format!(
            "\u{2713} Successfully wrote {editor_name} Bit rules file ({scope})\n  File created: {}\n\n  {} Add this line to your main CLAUDE.md file:\n  {}\n\n  {}",
            chalk.cyan(file_path),
            chalk.yellow("Integration:"),
            chalk.cyan(at_syntax),
            chalk.gray("This will automatically include all Bit-specific instructions."),
        );
        return chalk.green(&text);
    }
    let path_str = rules_path.to_string_lossy();
    let text = format!(
        "\u{2713} Successfully wrote {editor_name} Bit MCP rules file ({scope})\n  File written to: {}",
        chalk.cyan(&path_str),
    );
    chalk.green(&text)
}

fn vscode_prompts_path(is_global: bool, cwd: &Path) -> Result<PathBuf, String> {
    if !is_global {
        return Ok(cwd
            .join(".github")
            .join("instructions")
            .join("bit.instructions.md"));
    }
    let home = workspace_command::home();
    if cfg!(windows) {
        Ok(home
            .join("AppData")
            .join("Roaming")
            .join("Code")
            .join("User")
            .join("prompts")
            .join("bit.instructions.md"))
    } else if cfg!(target_os = "macos") {
        Ok(home
            .join("Library")
            .join("Application Support")
            .join("Code")
            .join("User")
            .join("prompts")
            .join("bit.instructions.md"))
    } else if cfg!(target_os = "linux") {
        Ok(home
            .join(".config")
            .join("Code")
            .join("User")
            .join("prompts")
            .join("bit.instructions.md"))
    } else {
        Err(format!("Unsupported platform: {}", env::consts::OS))
    }
}

fn cursor_prompts_path(is_global: bool, cwd: &Path) -> Result<PathBuf, String> {
    if is_global {
        return Err("Cursor does not support global prompts configuration in a file".into());
    }
    Ok(cwd
        .join(".cursor")
        .join("rules")
        .join("bit.rules.mdc"))
}

fn roo_prompts_path(is_global: bool, cwd: &Path) -> PathBuf {
    let base = if is_global { workspace_command::home() } else { cwd.to_path_buf() };
    base.join(".roo")
        .join("rules")
        .join("bit.instructions.md")
}

pub(super) fn cline_prompts_path(is_global: bool, cwd: &Path) -> Result<PathBuf, String> {
    if !is_global {
        return Ok(cwd.join(".clinerules").join("bit.instructions.md"));
    }
    if cfg!(target_os = "macos") {
        Ok(workspace_command::home()
            .join("Documents")
            .join("Cline")
            .join("Rules")
            .join("bit.instructions.md"))
    } else {
        let platform = match env::consts::OS {
            "windows" => "win32",
            "macos" => "darwin",
            other => other,
        };
        Err(format!(
            "Global Cline rules configuration is not supported on {platform}. The global path is only known for macOS (~/Documents/Cline/Rules/). For other operating systems, please use the --print flag to get the rules content and add it manually to your global Cline configuration.",
        ))
    }
}

fn claude_code_prompts_path(is_global: bool, cwd: &Path) -> PathBuf {
    let base = if is_global { workspace_command::home() } else { cwd.to_path_buf() };
    base.join(".claude").join("bit.md")
}

pub(super) fn cursor_settings_path(is_global: bool, cwd: &Path) -> PathBuf {
    let base = if is_global { workspace_command::home() } else { cwd.to_path_buf() };
    base.join(".cursor").join("mcp.json")
}

pub(super) fn windsurf_settings_path(is_global: bool, cwd: &Path) -> PathBuf {
    let base = if is_global { workspace_command::home() } else { cwd.to_path_buf() };
    base.join(".windsurf").join("mcp.json")
}

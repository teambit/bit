//! Native `bit mcp-server <setup|rules> [editor]` (`scopes/mcp/cli-mcp-server/{setup-cmd.ts,rules-cmd.ts}`).

mod rules;
#[cfg(test)]
mod tests;

use self::rules::{RulesOptions, cursor_settings_path, execute_rules, windsurf_settings_path};
use super::{
    Command,
    color::Chalk,
    workspace_command::{self, format::Formatter},
};
use crate::{history::History, native::Outcome, workspace};
use serde_json::{Map, Value, json};
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "mcp-server", aliases: &[], run };

const SETUP_EDITORS: &[&str] = &["vscode", "cursor", "windsurf", "roo", "cline", "claude-code"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct SetupOptions {
    pub editor: String,
    pub consumer_project: bool,
    pub include_additional: Option<String>,
    pub is_global: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Subcommand {
    Setup(SetupOptions),
    Rules(RulesOptions),
    Unrecognized(String),
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("mcp-server arguments are not UTF-8".into()));
    };
    let Some(subcommand) = parse_subcommand(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native mcp-server grammar".into()));
    };
    if let Subcommand::Unrecognized(sub) = &subcommand {
        return run_unrecognized(args, sub);
    }
    let cwd = env::current_dir()?;
    let chalk = Chalk::detect(args);
    let (label, report) = match &subcommand {
        Subcommand::Setup(opts) => ("setup", execute_setup(&cwd, opts, chalk)),
        Subcommand::Rules(opts) => ("rules", execute_rules(&cwd, opts, chalk)),
        Subcommand::Unrecognized(_) => unreachable!(),
    };
    let history = workspace::root(&cwd).map(|root| History::start(&root, args));
    let output = workspace_command::loader_output(chalk, false);
    output.restart(&format!(r#"running command "{label}"..."#));
    output.stop();
    let mut stdout = io::stdout().lock();
    writeln!(stdout, "{report}")?;
    stdout.flush()?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn run_unrecognized(args: &[OsString], sub: &str) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI mcp-server unrecognized delegated".into()));
    }
    let cwd = env::current_dir()?;
    let msg = format!(
        r#""{sub}" is not a subcommand of "mcp-server", please run "bit mcp-server --help" to list the subcommands"#,
    );
    if let Some(root) = workspace::root(&cwd) {
        workspace_command::execute_without_loader(&root, args, "mcp-server", |_| {
            Err(io::Error::other(msg))
        })
    } else {
        workspace_command::execute_failure_scope(
            &cwd,
            args,
            "mcp-server",
            true,
            "",
            io::Error::other(msg),
        )
    }
}

pub(super) fn parse_subcommand(args: &[&str]) -> Option<Subcommand> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| !matches!(*arg, "--no-color" | "--no-color=true" | "--no-color=false"))
        .collect::<Vec<_>>();
    match filtered.as_slice() {
        ["setup", rest @ ..] => parse_setup(rest).map(Subcommand::Setup),
        ["rules", rest @ ..] => rules::parse_rules(rest).map(Subcommand::Rules),
        [sub] if !sub.is_empty() && !sub.starts_with('-') && *sub != "start" => {
            Some(Subcommand::Unrecognized((*sub).to_owned()))
        }
        _ => None,
    }
}

fn parse_setup(rest: &[&str]) -> Option<SetupOptions> {
    let mut opts = SetupOptions {
        editor: String::new(),
        consumer_project: false,
        include_additional: None,
        is_global: false,
    };
    let mut editor = None;
    let mut idx = 0;
    while idx < rest.len() {
        if rest[idx] == "--" {
            super::internalize::consume_trailing_internalize(
                rest[idx + 1..].iter().copied(),
                &mut editor,
            )?;
            break;
        }
        apply_setup_arg(rest, &mut idx, &mut opts, &mut editor)?;
        idx += 1;
    }
    opts.editor = editor.unwrap_or_else(|| "vscode".into());
    Some(opts)
}

fn apply_setup_arg(
    rest: &[&str],
    idx: &mut usize,
    opts: &mut SetupOptions,
    editor: &mut Option<String>,
) -> Option<()> {
    match rest[*idx] {
        "--consumer-project" | "--consumer-project=true" => opts.consumer_project = true,
        "--consumer-project=false" => opts.consumer_project = false,
        "-g" | "--global" | "--global=true" => opts.is_global = true,
        "--global=false" => opts.is_global = false,
        "--include-additional" => {
            *idx += 1;
            let val = *rest.get(*idx)?;
            (!val.is_empty() && !val.starts_with('-')).then_some(())?;
            opts.include_additional = Some(val.to_owned());
        }
        arg if let Some(val) = arg.strip_prefix("--include-additional=") => {
            (!val.is_empty() && !val.starts_with('-')).then_some(())?;
            opts.include_additional = Some(val.to_owned());
        }
        arg if !arg.starts_with('-') && !arg.is_empty() && editor.is_none() => {
            *editor = Some(arg.to_owned());
        }
        _ => return None,
    }
    Some(())
}

pub(super) fn editor_display_name(editor: &str) -> &str {
    let trimmed = editor.trim();
    match trimmed.to_ascii_lowercase().as_str() {
        "vscode" => "VS Code",
        "cursor" => "Cursor",
        "windsurf" => "Windsurf",
        "roo" => "Roo Code",
        "cline" => "Cline",
        "claude-code" => "Claude Code",
        "codex" => "Codex",
        "copilot" => "GitHub Copilot",
        _ => trimmed,
    }
}

fn execute_setup(cwd: &Path, opts: &SetupOptions, chalk: Chalk) -> String {
    let formatter = Formatter::new(chalk);
    let editor_name = editor_display_name(&opts.editor);
    match setup_editor_and_path(cwd, opts) {
        Ok(config_path) => {
            let scope = if opts.is_global { "global" } else { "workspace" };
            let path_str = config_path.to_string_lossy();
            let summary = formatter.success_summary(&format!(
                "configured {editor_name} MCP integration ({scope})",
            ));
            let line2 = format!("  Configuration written to: {path_str}");
            if opts.editor.eq_ignore_ascii_case("claude-code") {
                let hint = formatter.hint("  Restart Claude Code to use the Bit MCP tools.");
                format!("{summary}\n{line2}\n{hint}")
            } else {
                format!("{summary}\n{line2}")
            }
        }
        Err(err_msg) => {
            format!(
                "{} Error setting up {editor_name} integration: {err_msg}",
                formatter.error_symbol(),
            )
        }
    }
}

fn setup_editor_and_path(cwd: &Path, opts: &SetupOptions) -> Result<PathBuf, String> {
    let editor_lower = opts.editor.to_ascii_lowercase();
    if !SETUP_EDITORS.contains(&editor_lower.as_str()) {
        return Err(format!(
            r#"Editor "{}" is not supported yet. Currently supported: {}"#,
            opts.editor,
            SETUP_EDITORS.join(", "),
        ));
    }
    let server_args = build_mcp_server_args(opts);
    match editor_lower.as_str() {
        "vscode" if opts.is_global => {
            let path = vscode_settings_path(true, cwd)?;
            write_vscode_global(&path, &server_args).map(|()| path)
        }
        "vscode" => {
            let path = cwd.join(".vscode").join("mcp.json");
            write_server_entry(&path, "servers", "bit-cli", stdio_entry(&server_args))
                .map(|()| path)
        }
        "cursor" => write_stdio_mcp_server(cursor_settings_path(opts.is_global, cwd), &server_args),
        "windsurf" => {
            write_stdio_mcp_server(windsurf_settings_path(opts.is_global, cwd), &server_args)
        }
        "roo" => write_stdio_mcp_server(roo_settings_path(opts.is_global, cwd)?, &server_args),
        "cline" => rules::cline_prompts_path(opts.is_global, cwd),
        "claude-code" => {
            let path = claude_code_settings_path(opts.is_global, cwd)?;
            let entry = json!({ "command": "bit", "args": server_args });
            write_server_entry(&path, "mcpServers", "bit", entry).map(|()| path)
        }
        _ => Err(format!(r#"Editor "{}" is not supported yet."#, opts.editor)),
    }
}

fn write_stdio_mcp_server(path: PathBuf, server_args: &[String]) -> Result<PathBuf, String> {
    write_server_entry(&path, "mcpServers", "bit", stdio_entry(server_args)).map(|()| path)
}

fn build_mcp_server_args(opts: &SetupOptions) -> Vec<String> {
    let mut args = vec!["mcp-server".to_owned(), "start".to_owned()];
    if opts.consumer_project {
        args.push("--consumer-project".into());
    }
    if let Some(additional) = &opts.include_additional
        && !additional.is_empty()
    {
        args.push("--include-additional".into());
        args.push(additional.clone());
    }
    args
}

fn stdio_entry(args: &[String]) -> Value {
    json!({
        "type": "stdio",
        "command": "bit",
        "args": args,
    })
}

fn write_vscode_global(path: &Path, server_args: &[String]) -> Result<(), String> {
    let mut settings = read_json_object(path)?;
    if !settings.get("mcp").is_some_and(Value::is_object) {
        settings.insert("mcp".into(), json!({}));
    }
    let mcp_obj = settings
        .get_mut("mcp")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "Invalid mcp object".to_owned())?;
    if !mcp_obj.get("servers").is_some_and(Value::is_object) {
        mcp_obj.insert("servers".into(), json!({}));
    }
    let servers_obj = mcp_obj
        .get_mut("servers")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "Invalid servers object".to_owned())?;
    servers_obj.insert("bit-cli".into(), stdio_entry(server_args));
    write_json_object(path, &Value::Object(settings))
}

fn write_server_entry(
    path: &Path,
    servers_key: &str,
    name: &str,
    entry: Value,
) -> Result<(), String> {
    let mut cfg = read_json_object(path)?;
    if !cfg.get(servers_key).is_some_and(Value::is_object) {
        cfg.insert(servers_key.into(), json!({}));
    }
    let servers_obj = cfg
        .get_mut(servers_key)
        .and_then(Value::as_object_mut)
        .ok_or_else(|| format!("Invalid {servers_key} object"))?;
    servers_obj.insert(name.into(), entry);
    write_json_object(path, &Value::Object(cfg))
}

fn read_json_object(path: &Path) -> Result<Map<String, Value>, String> {
    if !path.exists() {
        return Ok(Map::new());
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("config.json");
    let content =
        fs::read_to_string(path).map_err(|err| format!("Failed to parse {file_name}: {err}"))?;
    let val: Value = serde_json::from_str(&content)
        .or_else(|err| bit_object_import::parse_jsonc(content.as_bytes()).map_err(|_| err))
        .map_err(|err| format!("Failed to parse {file_name}: {err}"))?;
    val.as_object()
        .cloned()
        .ok_or_else(|| format!("Failed to parse {file_name}: expected JSON object"))
}

fn write_json_object(path: &Path, val: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let serialized = serde_json::to_string_pretty(val).map_err(|err| err.to_string())?;
    fs::write(path, serialized).map_err(|err| err.to_string())
}

fn vscode_settings_path(is_global: bool, cwd: &Path) -> Result<PathBuf, String> {
    if !is_global {
        return Ok(cwd.join(".vscode").join("settings.json"));
    }
    let home = workspace_command::home();
    if cfg!(windows) {
        Ok(home
            .join("AppData")
            .join("Roaming")
            .join("Code")
            .join("User")
            .join("settings.json"))
    } else if cfg!(target_os = "macos") {
        Ok(home
            .join("Library")
            .join("Application Support")
            .join("Code")
            .join("User")
            .join("settings.json"))
    } else if cfg!(target_os = "linux") {
        Ok(home
            .join(".config")
            .join("Code")
            .join("User")
            .join("settings.json"))
    } else {
        Err(format!("Unsupported platform: {}", env::consts::OS))
    }
}

fn roo_settings_path(is_global: bool, cwd: &Path) -> Result<PathBuf, String> {
    if is_global {
        return Err(
            "Roo Code global configuration is not supported as it uses VS Code internal storage that cannot be accessed. Please use workspace-specific configuration instead.".into(),
        );
    }
    Ok(cwd.join(".roo").join("mcp.json"))
}

fn claude_code_settings_path(is_global: bool, cwd: &Path) -> Result<PathBuf, String> {
    if !is_global {
        return Ok(cwd.join(".mcp.json"));
    }
    let home = workspace_command::home();
    if cfg!(windows) {
        Ok(home
            .join("AppData")
            .join("Roaming")
            .join("Claude")
            .join("claude_desktop_config.json"))
    } else if cfg!(target_os = "macos") {
        Ok(home
            .join("Library")
            .join("Application Support")
            .join("Claude")
            .join("claude_desktop_config.json"))
    } else if cfg!(target_os = "linux") {
        Ok(home
            .join(".config")
            .join("claude")
            .join("claude_desktop_config.json"))
    } else {
        Err(format!("Unsupported platform: {}", env::consts::OS))
    }
}

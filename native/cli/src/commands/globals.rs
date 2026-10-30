//! Native `bit globals` (`GlobalsCmd` in `scopes/harmony/global-config/globals.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, color::Chalk, workspace_command};
use crate::{history::History, native::Outcome, workspace};
use bit_workspace_config::{
    cache_root, environment_value, global_config_dir, merge_layers, parse_jsonc,
    read_global_config, scope_path, workspace_root, workspace_values,
};
use serde_json::{Map, Value};
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "globals", aliases: &[], run };

const CAPSULES_KEY: &str = "capsules_root_base_dir";

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(json) = parse_json_flag(args) else {
        return Ok(Outcome::Declined("arguments outside the native `globals` grammar".to_owned()));
    };
    let cwd = env::current_dir()?;
    let capsules = match resolve_capsules_dir(&cwd) {
        Ok(dir) => dir,
        Err(error) => return Ok(Outcome::Declined(error.to_string())),
    };
    let dirs = known_global_dirs(&cache_root(), &global_config_dir(), &capsules);
    let chalk = Chalk::detect(args);
    let text = if json { render_json(&dirs)? } else { render_report(&dirs, chalk) };
    let history = workspace::root(&cwd).map(|root| History::start(&root, args));
    let output = workspace_command::loader_output(chalk, json);
    if !json {
        output.restart(r#"running command "globals"..."#);
    }
    output.stop();
    if json {
        write!(io::stdout(), "{text}")?;
    } else {
        writeln!(io::stdout(), "{text}")?;
    }
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn parse_json_flag(args: &[OsString]) -> Option<bool> {
    let mut json = false;
    let rest = &args[1..];
    for (idx, raw) in rest.iter().enumerate() {
        let token = raw.to_str()?;
        match token {
            "--" => return (idx + 1 == rest.len()).then_some(json),
            "--no-color" => {}
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            _ => return None,
        }
    }
    Some(json)
}

pub(in crate::commands) fn resolve_capsules_dir(cwd: &Path) -> io::Result<String> {
    if let Some(from_env) = environment_value(CAPSULES_KEY) {
        return Ok(from_env);
    }
    let global = read_global_config(&global_config_dir())?;
    let ws_root = workspace_root(cwd);
    let scope = read_scope_layer(cwd, ws_root.as_deref())?;
    let ws = match ws_root {
        Some(root) => {
            Value::Object(workspace_values(&parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?))
        }
        None => Value::Null,
    };
    let combined = merge_layers(&global, &scope, &ws);
    if let Some(configured) = combined
        .get(CAPSULES_KEY)
        .and_then(Value::as_str)
        .filter(|val| !val.is_empty())
    {
        return Ok(configured.to_owned());
    }
    Ok(cache_root()
        .join("capsules")
        .to_string_lossy()
        .into_owned())
}

fn read_scope_layer(cwd: &Path, ws_root: Option<&Path>) -> io::Result<Value> {
    let scope_dir = ws_root
        .map(scope_path)
        .or_else(|| {
            cwd.ancestors()
                .find(|path| path.join("scope.json").is_file())
                .map(Path::to_owned)
        });
    let Some(dir) = scope_dir.filter(|path| path.join("scope.json").is_file()) else {
        return Ok(Value::Null);
    };
    let parsed: Value =
        serde_json::from_slice(&fs::read(dir.join("scope.json"))?).map_err(io::Error::other)?;
    Ok(parsed
        .get("config")
        .cloned()
        .unwrap_or(Value::Null))
}

fn known_global_dirs(
    cache: &Path,
    config_dir: &Path,
    capsules_dir: &str,
) -> Vec<(&'static str, String)> {
    vec![
        ("Global Dir", cache.to_string_lossy().into_owned()),
        (
            "Log file",
            cache
                .join("logs")
                .join("debug.log")
                .to_string_lossy()
                .into_owned(),
        ),
        (
            "Global Scope Dir",
            cache
                .join("scope")
                .to_string_lossy()
                .into_owned(),
        ),
        ("Config Dir", config_dir.to_string_lossy().into_owned()),
        ("Capsules Dir", capsules_dir.to_owned()),
    ]
}

fn render_json(dirs: &[(&'static str, String)]) -> io::Result<String> {
    let mut map = Map::with_capacity(dirs.len());
    for (key, val) in dirs {
        map.insert((*key).to_owned(), Value::String(val.clone()));
    }
    serde_json::to_string_pretty(&Value::Object(map)).map_err(io::Error::other)
}

fn render_report(dirs: &[(&'static str, String)], chalk: Chalk) -> String {
    let pad_max = dirs
        .iter()
        .map(|(key, _)| key.len())
        .max()
        .unwrap_or(0)
        + 1;
    let lines = dirs
        .iter()
        .map(|(key, val)| {
            let padded = format!("{key:<pad_max$}");
            format!("{} {val}", chalk.green(&padded))
        })
        .collect::<Vec<_>>()
        .join("\n");
    let title = r#"the following global directories are used by Bit. to change the global root directory, set the "BIT_GLOBALS_DIR" environment variable"#;
    format!("{title}\n\n{lines}")
}

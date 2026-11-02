//! Change the local tracking alias of a lane; the lane object is unchanged.
//!
//! [`run`] updates local lane alias mappings ([`list`], [`show`]) and formats the resulting [`Report`] with [`Chalk`].
use super::{list, show};
use crate::{
    commands::{
        color::Chalk,
        workspace_command::{self, results::Report},
    },
    native::Outcome,
    workspace,
};
use serde_json::{Value, json};
use std::{env, ffi::OsString, fs, io};

/// Executes `bit lane alias <lane-name> <alias>` and updates local lane tracking metadata.
pub(super) fn run(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some(tokens) = crate::commands::scope_set::collect_non_flag_tokens(lane_args) else {
        return Ok(Outcome::Declined("outside the native lane alias grammar".into()));
    };
    let [name, alias] = tokens.as_slice() else {
        return Ok(Outcome::Declined("outside the native lane alias grammar".into()));
    };
    let (name, alias) = (name.trim(), alias.trim());
    if !valid_alias_token(name) || !valid_alias_token(alias) {
        return Ok(Outcome::Declined("unsupported lane alias".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
            return Ok(Outcome::Declined("not inside a workspace".into()));
        }
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            "alias",
            false,
            "",
            io::Error::other("unable to alias a lane outside of Bit workspace"),
        );
    };
    run_in_workspace(&root, args, name, alias)
}

/// Returns whether `token` is a non-empty, non-flag lane or alias name within length bounds.
#[inline]
fn valid_alias_token(token: &str) -> bool {
    let trimmed = token.trim();
    !trimmed.is_empty() && !trimmed.starts_with('-') && trimmed.len() <= 1024
}

/// Validates the alias target inside `root`, persists `scope.json`, and emits the [`Report`].
fn run_in_workspace(
    root: &std::path::Path,
    args: &[OsString],
    name: &str,
    alias: &str,
) -> io::Result<Outcome> {
    if let Some(msg) = invalid_alias_error(name, alias) {
        if env::var_os("CI").is_some_and(|val| !val.is_empty())
            || crate::commands::installation::Installer::needs_canonical(root)
        {
            return Ok(Outcome::Declined("unsupported lane alias".into()));
        }
        return workspace_command::execute_then(root, args, "alias", |_| {
            Err(io::Error::other(msg))
        });
    }
    let scope_json_path = bit_workspace_config::scope_path(root).join("scope.json");
    let (config, label) = match prepare(root, &scope_json_path, name, alias) {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("lane alias: {error}"))),
    };
    let chalk = Chalk::detect(args);
    let report = Report {
        data: format!(
            "successfully added the alias {} for lane {}",
            chalk.bold(alias),
            chalk.bold(&label),
        ),
        code: 0,
        details: None,
    };
    workspace_command::execute_with(root, args, "alias", &report, |_| {
        fs::write(&scope_json_path, serde_json::to_vec_pretty(&config)?)
    })
}

#[inline]
fn invalid_alias_error(name: &str, alias: &str) -> Option<&'static str> {
    let name = name.trim();
    let alias = alias.trim();
    if alias.contains('/') {
        Some(r#"an alias cannot include a delimiter "/""#)
    } else if alias == name {
        Some("an alias cannot be the same as the lane name")
    } else {
        None
    }
}

#[inline]
fn resolve_lane_name_and_scope(root: &std::path::Path, name: &str) -> io::Result<(String, String)> {
    let (lanes, _) = list::read(root)?;
    let lane = show::find(&lanes, name)
        .filter(|lane| !lane.is_main())
        .ok_or_else(invalid)?;
    let lane_name = lane.id["name"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .ok_or_else(invalid)?;
    let scope = lane.id["scope"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .ok_or_else(invalid)?;
    Ok((lane_name.to_owned(), scope.to_owned()))
}

fn prepare(
    root: &std::path::Path,
    scope_json_path: &std::path::Path,
    name: &str,
    alias: &str,
) -> io::Result<(Value, String)> {
    let (lane_name, scope) = resolve_lane_name_and_scope(root, name)?;
    let mut config: Value = bit_object_import::parse_jsonc(&fs::read(scope_json_path)?)?;
    let Some(tracking) = config["lanes"]["tracking"].as_array_mut() else {
        return Err(invalid());
    };
    let local_name = name.split_once('/').map_or_else(|| name.trim(), |(_, value)| value.trim());
    let alias = alias.trim();
    tracking.retain(|row| {
        row["localLane"].as_str().map(str::trim) != Some(local_name)
            && !(row["remoteScope"].as_str().map(str::trim) == Some(scope.as_str())
                && row["remoteLane"].as_str().map(str::trim) == Some(lane_name.as_str()))
    });
    let data = json!({"localLane":alias,"remoteLane":lane_name,"remoteScope":scope});
    if let Some(existing) = tracking
        .iter_mut()
        .find(|row| row["localLane"].as_str().map(str::trim) == Some(alias))
    {
        *existing = data;
    } else {
        tracking.push(data);
    }
    Ok((config, format!("{scope}/{lane_name}")))
}

#[inline]
fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, "unsupported lane alias")
}

//! Change the local tracking alias of a lane; the lane object is unchanged.
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

pub(super) fn run(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some(tokens) = crate::commands::scope_set::collect_non_flag_tokens(lane_args) else {
        return Ok(Outcome::Declined("outside the native lane alias grammar".into()));
    };
    let [name, alias] = tokens.as_slice() else {
        return Ok(Outcome::Declined("outside the native lane alias grammar".into()));
    };
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

fn valid_alias_token(token: &str) -> bool {
    !token.is_empty() && !token.starts_with('-') && token.len() <= 1024
}

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
    let (config, label) = match prepare(root, name, alias) {
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
        fs::write(
            bit_workspace_config::scope_path(root).join("scope.json"),
            serde_json::to_string_pretty(&config)?.as_bytes(),
        )
    })
}

fn invalid_alias_error(name: &str, alias: &str) -> Option<&'static str> {
    if alias.contains('/') {
        Some(r#"an alias cannot include a delimiter "/""#)
    } else if alias == name {
        Some("an alias cannot be the same as the lane name")
    } else {
        None
    }
}

fn prepare(root: &std::path::Path, name: &str, alias: &str) -> io::Result<(Value, String)> {
    let (lanes, _) = list::read(root)?;
    let Some(lane) = show::find(&lanes, name).filter(|lane| !lane.is_main()) else {
        return Err(invalid());
    };
    let (Some(lane_name), Some(scope)) = (lane.id["name"].as_str(), lane.id["scope"].as_str())
    else {
        return Err(invalid());
    };
    let mut config: Value = bit_object_import::parse_jsonc(&fs::read(
        bit_workspace_config::scope_path(root).join("scope.json"),
    )?)?;
    let Some(tracking) = config["lanes"]["tracking"].as_array_mut() else {
        return Err(invalid());
    };
    let local_name = name.split_once('/').map_or(name, |(_, value)| value);
    if let Some(index) = tracking
        .iter()
        .position(|row| row["localLane"] == local_name)
    {
        tracking.remove(index);
    }
    let data = json!({"localLane":alias,"remoteLane":lane_name,"remoteScope":scope});
    if let Some(existing) = tracking
        .iter_mut()
        .find(|row| row["localLane"] == *alias)
    {
        *existing = data;
    } else {
        tracking.push(data);
    }
    Ok((config, format!("{scope}/{lane_name}")))
}

fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, "unsupported lane alias")
}

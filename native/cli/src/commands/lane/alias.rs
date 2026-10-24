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
    let [name, alias] = lane_args else {
        return Ok(Outcome::Declined("outside the native lane alias grammar".into()));
    };
    if alias.contains('/') || alias == name || alias.is_empty() {
        return Ok(Outcome::Declined("unsupported lane alias".into()));
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let (config, label) = match prepare(&root, name, alias) {
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
    workspace_command::execute_with(&root, args, "alias", &report, |_| {
        fs::write(
            bit_workspace_config::scope_path(&root).join("scope.json"),
            serde_json::to_string_pretty(&config)?.as_bytes(),
        )
    })
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
    let mut config: Value = serde_json::from_slice(&fs::read(
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

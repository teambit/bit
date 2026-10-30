//! Native `bit lane current`: read the bitmap and local lane tracking.

use super::list::read_current;
use crate::{commands::status::js::text, history::History, native::Outcome, workspace};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

/// `LaneCurrentCmd`: the bitmap's current lane and the local tracking alias.
pub(super) fn current(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let mut json = false;
    for (idx, &arg) in lane_args.iter().enumerate() {
        match arg {
            "--" if idx + 1 == lane_args.len() => break,
            "--no-color" => {}
            "--json" | "-j" | "--json=true" => json = true,
            "--json=false" => json = false,
            _ => {
                return Ok(Outcome::Declined(
                    "lane current flags outside the native grammar".into(),
                ));
            }
        }
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        write_current(
            &mut io::stdout().lock(),
            &json!({"name": "main", "scope": Value::Null}),
            "main",
            json,
        )?;
        return Ok(Outcome::Exit(ExitCode::SUCCESS));
    };
    let (id, alias) = match read_current(&root) {
        Ok(data) => data,
        Err(error) => return Ok(Outcome::Declined(format!("lane current: {error}"))),
    };
    let history = History::start(&root, args);
    write_current(&mut io::stdout().lock(), &id, &alias, json)?;
    history.end(true);
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn write_current(stdout: &mut impl Write, id: &Value, alias: &str, json: bool) -> io::Result<()> {
    let name = text(id.get("name"))?;
    let is_main = name == "main";
    let full =
        if is_main { "main".to_string() } else { format!("{}/{name}", text(id.get("scope"))?) };
    let data = if is_main {
        json!({"name":"main","scope":null,"id":"main","isDefault":true,"alias":null})
    } else {
        json!({"name":name,"scope":id["scope"],"id":full,"isDefault":false,
            "alias":(alias != name).then_some(alias)})
    };
    if json {
        stdout.write_all(serde_json::to_string_pretty(&data)?.as_bytes())?;
    } else if is_main || alias == name {
        writeln!(stdout, "{full}")?;
    } else {
        writeln!(stdout, "{full} ({alias})")?;
    }
    stdout.flush()?;
    Ok(())
}

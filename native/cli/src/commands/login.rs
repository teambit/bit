//! Native `bit login` (`scopes/cloud/cloud/login.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "login", aliases: &[], run };

const CONFLICTING_DOMAIN_ERR: &str =
    "use either --default-cloud-domain or --cloud-domain, not both";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub cloud_domain: Option<String>,
    pub default_cloud_domain: bool,
    pub port: Option<String>,
    pub no_browser: bool,
    pub machine_name: Option<String>,
    pub skip_config_update: bool,
    pub refresh_token: bool,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("login arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native login grammar".into()));
    };
    if options.default_cloud_domain
        && options.cloud_domain.is_some()
        && env::var_os("CI").is_none_or(|val| val.is_empty())
    {
        return emit_conflicting_domain_error(args, options.json);
    }
    Ok(Outcome::Declined("interactive browser login delegated".into()))
}

fn emit_conflicting_domain_error(args: &[OsString], json: bool) -> io::Result<Outcome> {
    let cwd = env::current_dir()?;
    if let Some(root) = workspace::root(&cwd) {
        if json {
            return workspace_command::execute_json(&root, args, "login", |_| {
                Err(io::Error::other(CONFLICTING_DOMAIN_ERR))
            });
        }
        return workspace_command::execute_then(&root, args, "login", |_| {
            Err(io::Error::other(CONFLICTING_DOMAIN_ERR))
        });
    }
    workspace_command::execute_failure_scope(
        &cwd,
        args,
        "login",
        json,
        "",
        io::Error::other(CONFLICTING_DOMAIN_ERR),
    )
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options {
        cloud_domain: None,
        default_cloud_domain: false,
        port: None,
        no_browser: false,
        machine_name: None,
        skip_config_update: false,
        refresh_token: false,
        json: false,
    };
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            return iter.next().is_none().then_some(options);
        }
        apply_login_arg(arg, &mut iter, &mut options)?;
    }
    Some(options)
}

fn apply_login_arg<'a>(
    arg: &'a str,
    iter: &mut impl Iterator<Item = &'a str>,
    options: &mut Options,
) -> Option<()> {
    match arg {
        "--no-color" => {}
        "--skip-config-update" | "--skip-config-update=true" => options.skip_config_update = true,
        "--skip-config-update=false" => options.skip_config_update = false,
        "--refresh-token" | "--refresh-token=true" => options.refresh_token = true,
        "--refresh-token=false" => options.refresh_token = false,
        "--default-cloud-domain" | "--default-cloud-domain=true" => {
            options.default_cloud_domain = true;
        }
        "--default-cloud-domain=false" => options.default_cloud_domain = false,
        "--no-browser"
        | "--no-browser=true"
        | "--suppress-browser-launch"
        | "--suppress-browser-launch=true" => options.no_browser = true,
        "--no-browser=false" | "--suppress-browser-launch=false" => options.no_browser = false,
        "-j" | "--json" | "--json=true" => options.json = true,
        "--json=false" => options.json = false,
        "-d" | "--cloud-domain" => options.cloud_domain = Some(take_val(iter.next()?)?),
        "-p" | "--port" => options.port = Some(take_val(iter.next()?)?),
        "--machine-name" => options.machine_name = Some(take_val(iter.next()?)?),
        _ => apply_inline_login_arg(arg, options)?,
    }
    Some(())
}

fn apply_inline_login_arg(arg: &str, options: &mut Options) -> Option<()> {
    if let Some(val) = arg
        .strip_prefix("--cloud-domain=")
        .or_else(|| arg.strip_prefix("-d="))
    {
        options.cloud_domain = Some(take_val(val)?);
    } else if let Some(val) = arg
        .strip_prefix("--port=")
        .or_else(|| arg.strip_prefix("-p="))
    {
        options.port = Some(take_val(val)?);
    } else {
        let val = arg.strip_prefix("--machine-name=")?;
        options.machine_name = Some(take_val(val)?);
    }
    Some(())
}

fn take_val(val: &str) -> Option<String> {
    (!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())
}

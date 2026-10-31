//! Native `bit run [app-name]` (`scopes/harmony/application/run.cmd.tsx`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    app_cmd::{
        GLOBAL_HELP, is_empty_app_workspace, run_missing_app, standard_nonapp_component_count,
    },
    color::Chalk,
    workspace_command,
};
use crate::{native::Outcome, workspace};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "run", aliases: &[], run };

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub app_name: Option<String>,
    pub dev: bool,
    pub port: Option<String>,
    pub verbose: bool,
    pub watch: bool,
    pub no_browser: bool,
    pub args: Option<String>,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("run arguments are not UTF-8".into()));
    };
    let chalk = Chalk::detect(args);
    if is_help_form(&argv[1..]) {
        io::stdout()
            .lock()
            .write_all(command_help("run", chalk).as_bytes())?;
        return Ok(Outcome::Exit(ExitCode::SUCCESS));
    }
    if let Some(unknown) = run_unsupported_help(&argv[1..]) {
        return print_unsupported_help(unknown, chalk);
    }
    if parse_options(&argv[1..]).is_none() {
        return Ok(Outcome::Declined("outside native run grammar".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return run_missing_app(args, 0);
    };
    if is_empty_app_workspace(&root).unwrap_or(false)
        && let Some(count) = standard_nonapp_component_count(&root)
    {
        return run_missing_app(args, count);
    }
    Ok(Outcome::Declined("run execution delegated".into()))
}

fn print_unsupported_help(unknown: &str, chalk: Chalk) -> io::Result<Outcome> {
    io::stdout()
        .lock()
        .write_all(unsupported_help("run", unknown, chalk).as_bytes())?;
    Ok(Outcome::Exit(ExitCode::FAILURE))
}

pub(super) fn unsupported_help(command: &str, unknown: &str, chalk: Chalk) -> String {
    let unknown = chalk.yellow(unknown);
    format!("{}\n{unknown}\n", command_help(command, chalk))
}

pub(super) fn command_help(command: &str, chalk: Chalk) -> String {
    let global = GLOBAL_HELP;
    let description = chalk.bold("start an application component locally");
    let app_name = chalk.green("  app-name");
    let dev = help_option(chalk, "-d", "--dev");
    let port = help_option(chalk, "-p", "--port");
    let verbose = help_option(chalk, "-v", "--verbose");
    let watch = help_option(chalk, "-w", "--watch");
    let no_browser = help_option(chalk, "-n", "--no-browser");
    let args = help_option(chalk, "-a", "--args");
    let link = chalk.underline("https://bit.dev/reference/apps/apps-overview/");
    format!(
        r#"bit {command} [app-name]

{description}
runs application components in their own development server, separate from the "bit start" UI.
apps are components that create deployable applications (React apps, Node.js servers, etc.).
when no app name is specified, automatically detects and runs the app if only one exists in the workspace.
for more info, visit: {link}

Arguments:
{app_name}  the app's name is registered by the app (run 'bit app list' to list the names of the available apps)

Options
  {dev}         start the application in dev mode.  [boolean]
  {port}        port to run the app on  [string]
  {verbose}     show verbose output for inspection and print stack trace  [boolean]
  {watch}       watch and compile your components upon changes  [boolean]
  {no_browser}  do not automatically open browser when ready  [boolean]
  {args}        the arguments passing to the app. for example, --args="--a=1 --b". don't forget to use quotes to wrap the value to escape special characters.  [string]

{global}
"#,
    )
}

pub(super) fn help_option(chalk: Chalk, short: &str, long: &str) -> String {
    format!("{}, {}", chalk.green(short), chalk.green(long))
}

pub(super) fn is_help_form(args: &[&str]) -> bool {
    match args {
        ["--help" | "-h"] => true,
        [name, "--help" | "-h"] if !name.is_empty() && !name.starts_with('-') => true,
        _ => false,
    }
}

fn run_unsupported_help(args: &[&str]) -> Option<&'static str> {
    match args {
        ["--no-color"] => Some("Unknown arguments: no-color, noColor"),
        [name, "--no-color"] if !name.is_empty() && !name.starts_with('-') => {
            Some("Unknown arguments: no-color, noColor")
        }
        ["--json"] => Some("Unknown argument: json"),
        [name, "--json"] if !name.is_empty() && !name.starts_with('-') => {
            Some("Unknown argument: json")
        }
        ["--ssr"] => Some("Unknown argument: ssr"),
        [name, "--ssr"] if !name.is_empty() && !name.starts_with('-') => {
            Some("Unknown argument: ssr")
        }
        _ => None,
    }
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut idx = 0;
    while idx < args.len() {
        if args[idx] == "--" {
            super::internalize::consume_trailing_internalize(
                args[idx + 1..].iter().copied(),
                &mut options.app_name,
            )?;
            break;
        }
        apply_run_token(args, &mut idx, &mut options)?;
        idx += 1;
    }
    Some(options)
}

fn apply_run_token(args: &[&str], idx: &mut usize, options: &mut Options) -> Option<()> {
    let arg = args[*idx];
    if arg == "--no-color" {
        return None;
    }
    if apply_run_bool_or_short(arg, options) {
        return Some(());
    }
    match arg {
        "-p" | "--port" => {
            if let Some(&next) = args.get(*idx + 1)
                && !next.starts_with('-')
            {
                options.port = Some(next.to_owned());
                *idx += 1;
            } else {
                options.port = Some(String::new());
            }
        }
        "-a" | "--args" => {
            let next = *args.get(*idx + 1)?;
            options.args = Some(next.to_owned());
            *idx += 1;
        }
        _ => apply_inline_or_app(arg, options)?,
    }
    Some(())
}

fn apply_run_bool_or_short(arg: &str, options: &mut Options) -> bool {
    if arg.starts_with('-')
        && !arg.starts_with("--")
        && arg.len() > 2
        && arg[1..]
            .bytes()
            .all(|byte| matches!(byte, b'd' | b'v' | b'w' | b'n'))
    {
        for byte in arg[1..].bytes() {
            match byte {
                b'd' => options.dev = true,
                b'v' => options.verbose = true,
                b'w' => options.watch = true,
                _ => options.no_browser = true,
            }
        }
        return true;
    }
    match arg {
        "-d" | "--dev" | "--dev=true" => options.dev = true,
        "--dev=false" => options.dev = false,
        "-v" | "--verbose" | "--verbose=true" => options.verbose = true,
        "--verbose=false" => options.verbose = false,
        "-w" | "--watch" | "--watch=true" => options.watch = true,
        "--watch=false" => options.watch = false,
        "-n" | "--no-browser" | "--no-browser=true" => options.no_browser = true,
        "--no-browser=false" => options.no_browser = false,
        _ => return false,
    }
    true
}

fn apply_inline_or_app(arg: &str, options: &mut Options) -> Option<()> {
    if let Some(val) = arg
        .strip_prefix("--port=")
        .or_else(|| arg.strip_prefix("-p="))
    {
        options.port = Some(val.to_owned());
    } else if let Some(val) = arg
        .strip_prefix("--args=")
        .or_else(|| arg.strip_prefix("-a="))
    {
        options.args = Some(val.to_owned());
    } else if !arg.starts_with('-')
        && !arg.trim().is_empty()
        && options.app_name.is_none()
    {
        options.app_name = Some(arg.trim().to_owned());
    } else {
        return None;
    }
    Some(())
}

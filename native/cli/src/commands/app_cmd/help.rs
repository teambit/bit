//! Released app command help and rejected-option output.

use super::{GLOBAL_HELP, inline_json_value, run_cmd};

pub(super) fn app_run_help_name<'a>(argv: &[&'a str]) -> Option<&'a str> {
    let name = *argv.first()?;
    let ["run" | "c", rest @ ..] = &argv[1..] else {
        return None;
    };
    run_cmd::is_help_form(rest).then_some(name)
}

pub(super) fn app_help_output(argv: &[&str]) -> Option<String> {
    let name = *argv.first()?;
    match &argv[1..] {
        ["--help" | "-h"] => Some(app_command_help(name)),
        ["list", "--help" | "-h"] => Some(list_command_help(name)),
        _ => None,
    }
}

pub(super) fn unsupported_flag_help(argv: &[&str]) -> Option<String> {
    let name = *argv.first()?;
    match &argv[1..] {
        ["run" | "c", flag @ ("--ssr" | "--json" | "--no-color")] => {
            return Some(run_flag_help(name, flag));
        }
        ["run" | "c", app_name, flag @ ("--ssr" | "--json" | "--no-color")]
            if !app_name.is_empty() && !app_name.starts_with('-') =>
        {
            return Some(run_flag_help(name, flag));
        }
        _ => {}
    }
    let (list, args) = match &argv[1..] {
        ["list", rest @ ..] => (true, rest),
        rest => (false, rest),
    };
    let unknown = rejected_app_option(args, list)?;
    let help = if list { list_command_help(name) } else { app_command_help(name) };
    Some(format!("{help}\n{unknown}\n"))
}

fn rejected_app_option(args: &[&str], list: bool) -> Option<&'static str> {
    let flag = match args {
        [json, "--no-color"] | ["--no-color", json] if list && is_json_flag(json) => {
            return Some("Unknown arguments: no-color, noColor");
        }
        [flag] => *flag,
        [flag @ ("--port" | "--args" | "-p" | "-a"), value] if !value.starts_with('-') => *flag,
        _ => return None,
    };
    let flag = flag.split_once('=').map_or(flag, |(name, _)| name);
    if list && flag == "--json" {
        return None;
    }
    match flag {
        "--json" => Some("Unknown argument: json"),
        "--ssr" => Some("Unknown argument: ssr"),
        "--dev" => Some("Unknown argument: dev"),
        "--verbose" => Some("Unknown argument: verbose"),
        "--watch" => Some("Unknown argument: watch"),
        "--port" => Some("Unknown argument: port"),
        "--args" => Some("Unknown argument: args"),
        "--no-color" => Some("Unknown arguments: no-color, noColor"),
        "--no-browser" => Some("Unknown arguments: no-browser, noBrowser"),
        "-d" => Some("Unknown argument: d"),
        "-v" => Some("Unknown argument: v"),
        "-n" => Some("Unknown argument: n"),
        "-w" => Some("Unknown argument: w"),
        "-p" => Some("Unknown argument: p"),
        "-a" => Some("Unknown argument: a"),
        _ => None,
    }
}

fn is_json_flag(flag: &str) -> bool {
    matches!(flag, "-j" | "--json") || inline_json_value(flag).is_some()
}

fn app_command_help(name: &str) -> String {
    let global = GLOBAL_HELP;
    format!(
        "bit {name} [sub-command]\n\nmanage application components\napplications are components that create deployable, runnable applications like React apps or Node.js servers.\nlist available apps in the workspace and inspect their configurations.\nuse \"bit run\" to start an application locally.\nfor more info, visit: https://bit.dev/docs/getting-started/composing/create-apps\n\nCommands:\n  bit {name} list            list all registered apps\n  bit {name} run [app-name]  start an application component locally  [aliases: c]\n\n{global}\n",
    )
}

fn list_command_help(name: &str) -> String {
    let global = GLOBAL_HELP;
    format!(
        "bit {name} list\n\nlist all registered apps\nfor more info, visit: https://bit.dev/reference/reference/cli-reference\n\nOptions\n  -j, --json  return the component data in json format  [boolean]\n\n{global}\n",
    )
}

fn run_flag_help(name: &str, flag: &str) -> String {
    let unknown = match flag {
        "--ssr" => "Unknown argument: ssr",
        "--json" => "Unknown argument: json",
        "--no-color" => "Unknown arguments: no-color, noColor",
        _ => unreachable!("only supported rejected flags call run_flag_help"),
    };
    run_cmd::unsupported_help(&format!("{name} run"), unknown)
}

//! Released app command help and rejected-option output.

mod json_color;

use super::{Chalk, GLOBAL_HELP, inline_json_value, run_cmd};

pub(super) fn app_run_help_name<'a>(argv: &[&'a str]) -> Option<&'a str> {
    let name = argv
        .first()
        .copied()
        .map(str::trim)
        .filter(|name| !name.is_empty())?;
    let ["run" | "c", rest @ ..] = &argv[1..] else {
        return None;
    };
    run_cmd::is_help_form(rest).then_some(name)
}

pub(super) fn app_help_output(argv: &[&str], chalk: Chalk) -> Option<String> {
    let name = argv
        .first()
        .copied()
        .map(str::trim)
        .filter(|name| !name.is_empty())?;
    match &argv[1..] {
        ["--help" | "-h"] => Some(app_command_help(name, chalk)),
        ["list", "--help" | "-h"] => Some(list_command_help(name, chalk)),
        _ => None,
    }
}

pub(super) fn unsupported_flag_help(argv: &[&str], chalk: Chalk) -> Option<String> {
    let name = argv
        .first()
        .copied()
        .map(str::trim)
        .filter(|name| !name.is_empty())?;
    match &argv[1..] {
        ["run" | "c", flag @ ("--ssr" | "--json" | "--no-color")] => {
            return Some(run_flag_help(name, flag, chalk));
        }
        ["run" | "c", app_name, flag @ ("--ssr" | "--json" | "--no-color")]
            if !app_name.trim().is_empty() && !app_name.starts_with('-') =>
        {
            return Some(run_flag_help(name, flag, chalk));
        }
        _ => {}
    }
    let (list, args) = match &argv[1..] {
        ["list", rest @ ..] => (true, rest),
        rest => (false, rest),
    };
    let unknown = app_option_error(args, list)?;
    let unknown = chalk.yellow(&unknown);
    let help = if list { list_command_help(name, chalk) } else { app_command_help(name, chalk) };
    Some(format!("{help}\n{unknown}\n"))
}

fn app_option_error(args: &[&str], list: bool) -> Option<String> {
    if let Some(error) = json_color::error(args, list) {
        return Some(error);
    }
    let leading_value = if list { list_leading_json_value_error(args) } else { None };
    leading_value.or_else(|| rejected_app_option(args, list)).map(str::to_owned)
}

fn rejected_app_option(args: &[&str], list: bool) -> Option<&'static str> {
    if list && list_json_no_color(args) {
        return Some("Unknown arguments: no-color, noColor");
    }
    let flag = match args {
        [flag] => flag.trim(),
        [flag @ ("--port" | "--args" | "-p" | "-a"), value] if !value.starts_with('-') => {
            flag.trim()
        }
        _ => return None,
    };
    let flag = flag.split_once('=').map_or(flag, |(name, _)| name.trim());
    if list && matches!(flag, "--json" | "-j") {
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

fn list_json_no_color(args: &[&str]) -> bool {
    match args {
        [json, "--no-color"] | ["--no-color", json] => is_json_flag(json),
        [json, "true" | "false", "--no-color"]
        | ["--no-color", json, "true" | "false"]
        | [json, "--no-color", "true" | "false"]
        | ["--no-color", "true" | "false", json] => matches!(*json, "-j" | "--json"),
        _ => false,
    }
}

fn list_leading_json_value_error(args: &[&str]) -> Option<&'static str> {
    match args {
        [value, json, "--no-color"] | [value, "--no-color", json]
            if matches!(*json, "-j" | "--json") =>
        {
            match *value {
                "true" => Some("Unknown arguments: no-color, noColor, true"),
                "false" => Some("Unknown arguments: no-color, noColor, false"),
                _ => None,
            }
        }
        _ => None,
    }
}

fn is_json_flag(flag: &str) -> bool {
    matches!(flag, "-j" | "--json") || inline_json_value(flag).is_some()
}

fn app_command_help(name: &str, chalk: Chalk) -> String {
    let global = GLOBAL_HELP;
    let description = chalk.bold("manage application components");
    let link = chalk.underline("https://bit.dev/docs/getting-started/composing/create-apps");
    format!(
        "bit {name} [sub-command]\n\n{description}\napplications are components that create deployable, runnable applications like React apps or Node.js servers.\nlist available apps in the workspace and inspect their configurations.\nuse \"bit run\" to start an application locally.\nfor more info, visit: {link}\n\nCommands:\n  bit {name} list            list all registered apps\n  bit {name} run [app-name]  start an application component locally  [aliases: c]\n\n{global}\n",
    )
}

fn list_command_help(name: &str, chalk: Chalk) -> String {
    let global = GLOBAL_HELP;
    let description = chalk.bold("list all registered apps");
    let json = run_cmd::help_option(chalk, "-j", "--json");
    let link = chalk.underline("https://bit.dev/reference/reference/cli-reference");
    format!(
        "bit {name} list\n\n{description}\nfor more info, visit: {link}\n\nOptions\n  {json}  return the component data in json format  [boolean]\n\n{global}\n",
    )
}

fn run_flag_help(name: &str, flag: &str, chalk: Chalk) -> String {
    let unknown = match flag {
        "--ssr" => "Unknown argument: ssr",
        "--json" => "Unknown argument: json",
        "--no-color" => "Unknown arguments: no-color, noColor",
        _ => unreachable!("only supported rejected flags call run_flag_help"),
    };
    run_cmd::unsupported_help(&format!("{name} run"), unknown, chalk)
}

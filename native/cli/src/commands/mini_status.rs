//! Native `bit mini-status --json` (`ms -j`): the Rust status engine of
//! `bit-object-import` decides which components are modified or new, as it
//! does for the Node.js CLI's in-process route. Workspaces the engine does not
//! own (configured extensions, global `.bitrc.jsonc`, more than 4096
//! components) and every other flag decline to the Node.js CLI.

use super::{
    color::Chalk,
    engine::Engine,
    inventory::{Inventory, Options},
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, history::History, native::Outcome, workspace};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "mini-status", aliases: &["ms"], run };

const MAX_COMPONENTS: usize = 4096;

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(json) = parse_json_flag(args) else {
        return Ok(Outcome::Declined("only `--json` or no flags run natively".to_string()));
    };
    let report = |summary: &Summary, chalk: Chalk| {
        if json {
            None
        } else {
            Some(Report { data: report(summary, chalk), code: 0, details: None })
        }
    };
    print(args, report, serde_json::to_string_pretty, false)
}

fn parse_json_flag(args: &[OsString]) -> Option<bool> {
    let mut json = false;
    let rest = &args[1..];
    for (idx, arg) in rest.iter().enumerate() {
        match arg.to_str()? {
            "--" => return (idx + 1 == rest.len()).then_some(json),
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            "--no-color" => {}
            _ => return None,
        }
    }
    Some(json)
}

/// `bit status --quick`: `StatusCmd.reportQuick`, or with `--json` the
/// modified and new components.
pub(super) fn quick(args: &[OsString], json: bool) -> io::Result<Outcome> {
    let report = |summary: &Summary, chalk: Chalk| {
        if json {
            None
        } else {
            Some(Report { data: quick_report(summary, chalk), code: 0, details: None })
        }
    };
    print(
        args,
        report,
        |summary| {
            serde_json::to_string_pretty(
                &json!({"modified": summary.modified, "newComponents": summary.new_comps}),
            )
        },
        true,
    )
}

/// Read the summary, then print the report after the loader's line, or the
/// JSON.
fn print(
    args: &[OsString],
    report: impl FnOnce(&Summary, Chalk) -> Option<Report>,
    json: impl FnOnce(&Summary) -> serde_json::Result<String>,
    load_aspects: bool,
) -> io::Result<Outcome> {
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    let Some(home) = home_dir() else {
        return Ok(Outcome::Declined("no home directory".to_string()));
    };
    let summary = match initialized_summary(&root, &home, load_aspects)? {
        Ok(summary) => summary,
        Err(reason) => return Ok(Outcome::Declined(reason)),
    };
    if let Some(report) = report(&summary, Chalk::detect(args)) {
        let command = if args[0] == "status" || args[0] == "s" { "status" } else { "mini-status" };
        return workspace_command::execute_with(&root, args, command, &report, |_| Ok(()));
    }
    let history = History::start(&root, args);
    // `CommandRunner` writes `JSON.stringify(data, null, 2)` without a newline.
    let mut stdout = io::stdout().lock();
    stdout.write_all(json(&summary)?.as_bytes())?;
    stdout.flush()?;
    history.end(true);
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn initialized_summary(
    root: &Path,
    home: &Path,
    enabled: bool,
) -> io::Result<Result<Summary, String>> {
    let (result, startup) = summarize_with_startup(root, home, enabled);
    io::stdout().write_all(startup.stdout.as_bytes())?;
    match result {
        Err(error) if startup.committed => Err(error),
        Ok(None) if startup.committed => Err(io::Error::other(
            "status workspace outside engine limits after startup publication",
        )),
        Ok(Some(summary)) => Ok(Ok(summary)),
        Ok(None) => Ok(Err("workspace outside the engine's limits".into())),
        Err(error) => Ok(Err(format!("status engine: {error}"))),
    }
}

fn summarize_with_startup(
    root: &Path,
    home: &Path,
    enabled: bool,
) -> (io::Result<Option<Summary>>, super::status::autosync::Startup) {
    let mut startup = super::status::autosync::Startup::default();
    let result = (|| {
        if enabled {
            let mut engine = Engine::new()?;
            super::status::autosync::run(&mut engine, root, &mut startup)?;
            super::status::environments::quick(root, home, &mut startup)?;
        }
        summarize(root, home)
    })();
    (result, startup)
}

/// `MiniStatusCmd.report` without `--show-issues`.
fn report(summary: &Summary, chalk: Chalk) -> String {
    let section = |title: &str, ids: &[String]| {
        let ids = if ids.is_empty() { "<none>".to_string() } else { ids.join("\n") };
        format!("{}:\n{ids}", chalk.bold(title))
    };
    format!(
        "{}\n\n{}",
        section("modified components (files only)", &summary.modified),
        section("new components", &summary.new_comps),
    )
}

/// `StatusCmd.reportQuick`.
fn quick_report(summary: &Summary, chalk: Chalk) -> String {
    let format = Formatter::new(chalk);
    let section = |title: &str, ids: &[String]| {
        let items: Vec<String> = ids
            .iter()
            .map(|id| format.item(&chalk.cyan(id)))
            .collect();
        format.section(title, "", &items)
    };
    let sections = Formatter::join(&[
        section("modified components (files only)", &summary.modified),
        section("new components", &summary.new_comps),
    ]);
    if sections.is_empty() {
        return format.success_summary(
            r#"no new or modified components (based on file changes only, use "bit status" for full check)"#,
        );
    }
    sections
}

fn home_dir() -> Option<std::path::PathBuf> {
    let home = if cfg!(windows) { env::var_os("USERPROFILE") } else { env::var_os("HOME") };
    home.filter(|home| !home.is_empty())
        .map(Into::into)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Summary {
    modified: Vec<String>,
    new_comps: Vec<String>,
    comp_with_issues: Vec<Value>,
}

#[derive(Deserialize)]
struct Plan {
    count: usize,
    #[serde(flatten)]
    options: Options,
}

/// Prepare, then scan and finish each component, then
/// complete. `None` when the workspace is outside the engine's limits.
fn summarize(root: &Path, home: &Path) -> io::Result<Option<Summary>> {
    let mut engine = Engine::new()?;
    let plan: Plan = engine.request(&json!({"kind": "statusPrepare", "root": root, "home": home}))?;
    if plan.count > MAX_COMPONENTS {
        return Ok(None);
    }
    let inventory = Inventory::new(&plan.options)?;
    for _ in 0..plan.count {
        let _: Value = inventory.scan(&mut engine, json!({"kind": "statusScan"}), "statusFinish")?;
    }
    let summary: Summary = engine.request(&json!({"kind": "statusComplete"}))?;
    Ok(valid(&summary, plan.count).then_some(summary))
}

/// `validSummary`.
fn valid(summary: &Summary, count: usize) -> bool {
    let ids_valid = |ids: &Vec<String>| {
        ids.len() <= count
            && ids
                .iter()
                .all(|id| !id.is_empty() && id.len() <= 2049)
    };
    ids_valid(&summary.modified)
        && ids_valid(&summary.new_comps)
        && summary.comp_with_issues.is_empty()
}

#[cfg(test)]
mod mini_status_tests;

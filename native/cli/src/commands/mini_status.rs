//! Native `bit mini-status --json` (`ms -j`): the Rust status engine of
//! `bit-object-import` decides which components are modified or new, as it
//! does for the Node.js CLI's in-process route. Workspaces the engine does not
//! own (configured extensions, global `.bitrc.jsonc`, more than 4096
//! components) and every other flag decline to the Node.js CLI.

use super::{
    engine::Engine,
    inventory::{Inventory, Options},
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
    if !matches!(args, [_, flag] if flag == "--json" || flag == "-j") {
        return Ok(Outcome::Declined("only `--json` runs natively".to_string()));
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    let Some(home) = home_dir() else {
        return Ok(Outcome::Declined("no home directory".to_string()));
    };
    let summary = match summarize(&root, &home) {
        Ok(Some(summary)) => summary,
        Ok(None) => return Ok(Outcome::Declined("workspace outside the engine's limits".into())),
        Err(error) => return Ok(Outcome::Declined(format!("status engine: {error}"))),
    };
    let history = History::start(&root, args);
    // `CommandRunner` writes `JSON.stringify(data, null, 2)` without a newline.
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(&summary)?.as_bytes())?;
    stdout.flush()?;
    history.end(true);
    Ok(Outcome::Exit(ExitCode::SUCCESS))
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

/// `readRustMiniStatus`: prepare, then scan and finish each component, then
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

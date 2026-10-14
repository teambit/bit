//! Native `bit mini-status --json` (`ms -j`): the Rust status engine of
//! `bit-object-import` decides which components are modified or new, as it
//! does for the Node.js CLI's in-process route. Workspaces the engine does not
//! own (configured extensions, global `.bitrc.jsonc`, more than 4096
//! components) and every other flag decline to the Node.js CLI.

mod engine;
mod rebase;

use crate::{commands::Command, history::History, native::Outcome, workspace};
use bit_ignore::{Ignore, Rule};
use engine::Engine;
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

/// `ALWAYS_IGNORE_LIST` of `@teambit/legacy.constants`.
const ALWAYS_IGNORE: &[&str] = &[
    "**/.DS_Store",
    "**/.env",
    "**/.env.local",
    "**/.env.**.local",
    "**/component.json",
    "**/node_modules/**",
];
/// `BIT_GENERATED_IGNORE_LIST`; `IGNORE_LIST` is both lists.
const BIT_GENERATED_IGNORE: &[&str] = &["package.json", "**/package-lock.json", "**/yarn.lock"];
/// `IGNORE_ROOT_ONLY_LIST`.
const IGNORE_ROOT_ONLY: &[&str] = &[
    "tsconfig.json",
    ".eslintrc.json",
    ".prettierrc.cjs",
    ".oxlintrc.json",
    ".oxlintrc.jsonc",
    "oxlint.config.ts",
    "oxlint.config.js",
];
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
#[serde(rename_all = "camelCase")]
struct Plan {
    count: usize,
    patterns: Vec<String>,
    track_all_files: bool,
    ignored_files: Vec<String>,
}

#[derive(Deserialize)]
struct Scan {
    token: u64,
    nested: Vec<Nested>,
    own: Vec<String>,
}

#[derive(Deserialize)]
struct Nested {
    directory: String,
    patterns: Vec<String>,
}

/// `readRustMiniStatus`: prepare, then scan and finish each component, then
/// complete. `None` when the workspace is outside the engine's limits.
fn summarize(root: &Path, home: &Path) -> io::Result<Option<Summary>> {
    let mut engine = Engine::new()?;
    let plan: Plan = engine.request(&json!({"kind": "statusPrepare", "root": root, "home": home}))?;
    if plan.count > MAX_COMPONENTS {
        return Ok(None);
    }
    let lists = Lists::new(plan.track_all_files);
    let root_ignore = root_ignore(&plan, &lists)?;
    for _ in 0..plan.count {
        finish_component(&mut engine, &root_ignore, &lists)?;
    }
    let summary: Summary = engine.request(&json!({"kind": "statusComplete"}))?;
    Ok(valid(&summary, plan.count).then_some(summary))
}

/// Bit's own ignore lists, as `trackAllFiles` selects them.
struct Lists {
    /// `ALWAYS_IGNORE_LIST`, or `IGNORE_LIST` without `trackAllFiles`.
    hard: Vec<&'static str>,
    ignored_root: &'static [&'static str],
}

impl Lists {
    fn new(track_all_files: bool) -> Self {
        if track_all_files {
            return Self { hard: ALWAYS_IGNORE.to_vec(), ignored_root: &[] };
        }
        let hard = ALWAYS_IGNORE
            .iter()
            .chain(BIT_GENERATED_IGNORE)
            .copied()
            .collect();
        Self { hard, ignored_root: IGNORE_ROOT_ONLY }
    }
}

/// The workspace's own patterns, Bit's list, then `ignoredFiles`.
fn root_ignore(plan: &Plan, lists: &Lists) -> io::Result<Ignore> {
    let patterns = plan.patterns.iter().map(String::as_str);
    let ignored_files = plan.ignored_files.iter().map(String::as_str);
    let mut ignore = Ignore::new();
    ignore
        .add(
            patterns
                .chain(lists.hard.iter().copied())
                .chain(ignored_files),
        )
        .map_err(io::Error::other)?;
    Ok(ignore)
}

/// Scan the next component, then finish it with its nested ignore files.
fn finish_component(engine: &mut Engine, root_ignore: &Ignore, lists: &Lists) -> io::Result<()> {
    let scan: Scan =
        engine.request(&json!({"kind": "statusScan", "rootPolicy": policy(root_ignore.rules())}))?;
    let nested: Vec<String> = scan.nested
        .iter()
        .flat_map(|row| row.patterns.iter().map(|pattern| rebase::pattern(pattern, &row.directory)))
        .collect();
    // Compiled in the Node.js glue's order: the regex cache is shared.
    let combined = compile(Some(root_ignore), &nested)?;
    let hard = compile(None, &lists.hard)?;
    let own = compile(None, &scan.own)?;
    let _: Value = engine.request(&json!({
        "kind": "statusFinish",
        "token": scan.token,
        "combined": policy(combined.rules()),
        "hard": policy(hard.rules()),
        "own": policy(own.rules()),
        "ignoredRoot": lists.ignored_root,
    }))?;
    Ok(())
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

/// `ignore().add(base).add(patterns)`.
fn compile(base: Option<&Ignore>, patterns: &[impl AsRef<str>]) -> io::Result<Ignore> {
    let mut ignore = Ignore::new();
    if let Some(base) = base {
        ignore.add_ignore(base);
    }
    ignore
        .add(patterns.iter().map(AsRef::as_ref))
        .map_err(io::Error::other)?;
    Ok(ignore)
}

/// `captureRustInventoryPolicy(ignore)` of a fresh instance: its rules and
/// its empty match cache.
fn policy(rules: &[Rule]) -> Value {
    json!({ "rules": rules, "cache": [] })
}

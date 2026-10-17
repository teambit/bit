//! Native `bit merge [component-pattern] --resolve`: the components in merge
//! state are snapped by the engine's `commandResolve*` requests, and reported like `MergeCmd`'s resolved
//! components.

use crate::{
    commands::{
        color::Chalk,
        ids::Id,
        status::{
            autosync::Startup,
            js::{array, decline, object, text},
        },
        workspace_command::{
            self, format::Formatter, progress::Progress, resolve, results::Report,
        },
    },
    native::Outcome,
    workspace,
};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
};

/// `--resolve` with an optional pattern,
/// `--message` and `-x`.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Options {
    pub build: bool,
    pub pattern: Option<String>,
    pub message: Option<String>,
}

/// `args` starts after the command name; `None` without `--resolve`.
pub fn parse(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut flags: Vec<&str> = Vec::new();
    let mut index = 0;
    while index < args.len() {
        let flag = match args[index] {
            "-m" => "--message",
            "-x" => "--skip-dependency-installation",
            other => other,
        };
        index += 1;
        if !flag.starts_with('-') {
            options.positional(flag)?;
        } else if flags.contains(&flag) || !FLAGS.contains(&flag) {
            return None;
        } else {
            flags.push(flag);
            index += options.flag(flag, args.get(index).copied())?;
        }
    }
    flags.contains(&"--resolve").then_some(options)
}

const FLAGS: [&str; 4] = ["--message", "--resolve", "--skip-dependency-installation", "--build"];

impl Options {
    /// One flag; the number of values it consumed.
    fn flag(&mut self, flag: &str, next: Option<&str>) -> Option<usize> {
        if flag == "--build" {
            self.build = true;
        }
        if flag != "--message" {
            return Some(0);
        }
        let message = next.filter(|message| !message.starts_with('-'))?;
        self.message = Some(message.to_string());
        Some(1)
    }

    /// The one pattern, without state selectors.
    fn positional(&mut self, text: &str) -> Option<()> {
        let state = text
            .split(',')
            .any(|part| part.trim().starts_with('$') || part.contains(" AND "));
        if self.pattern.is_some() || text.len() > 4096 || text.contains('\0') || state {
            return None;
        }
        self.pattern = Some(text.to_string());
        Some(())
    }
}

pub fn run(args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    let argv = workspace_command::utf8_args(args).ok_or_else(|| decline("resolve arguments"))?;
    let mut workflow = resolve::workflow::Workflow::default();
    workflow.build = options.build;
    workflow.configure(&root, &argv[1..], resolve::Kind::Resolve)?;
    let mut startup = Startup::default();
    let planned = plan_with_workflow(
        &root,
        options.pattern.as_deref(),
        options.message.as_deref(),
        &mut startup,
        &workflow,
    );
    let mut planned = match planned {
        Ok(planned) => planned,
        Err(error) if startup.committed => return failure(&root, args, &startup, error),
        Err(error) => return Ok(Outcome::Declined(format!("merge --resolve: {error}"))),
    };
    let report = format(&planned.plan["result"], Chalk::detect(args))?;
    let progress = Progress::parse_snap(planned.plan.get("progress"))?;
    io::stdout().write_all(startup.stdout.as_bytes())?;
    workspace_command::execute_then(&root, args, "merge", |output| {
        resolve::render_events(output, &startup)?;
        if let Some(progress) = &progress {
            if startup.snapshot_events.is_empty() {
                progress.render_merge(output);
            } else {
                progress.render_graph(output);
            }
        }
        resolve::render_build_output(output, &startup, false)?;
        workspace_command::commit(&mut planned, &root)?;
        crate::commands::status::cleanup_temporary(&root)?;
        Ok(report)
    })
}

pub(in crate::commands) fn plan_with_workflow(
    root: &Path,
    pattern: Option<&str>,
    message: Option<&str>,
    startup: &mut Startup,
    workflow: &resolve::workflow::Workflow,
) -> io::Result<workspace_command::Planned> {
    let options = json!({"pattern":pattern,"message":message});
    let request = resolve::ResolveRequest {
        kind: resolve::Kind::Resolve,
        options,
        selection: resolve::Selection::Resolve { pattern },
    };
    resolve::plan_snapshot(root, &request, startup, workflow)
}

pub(in crate::commands) fn plan_continuation(
    root: &Path,
    pattern: Option<&str>,
    message: Option<&str>,
    startup: &mut Startup,
    workflow: &resolve::workflow::Workflow,
    environment: Option<crate::commands::status::environments::Environments>,
) -> io::Result<workspace_command::Planned> {
    let request = resolve::ResolveRequest {
        kind: resolve::Kind::Resolve,
        options: json!({"pattern":pattern,"message":message}),
        selection: resolve::Selection::Resolve { pattern },
    };
    resolve::plan_continuation(root, &request, startup, workflow, environment)
}

fn failure(
    root: &Path,
    args: &[OsString],
    startup: &Startup,
    error: io::Error,
) -> io::Result<Outcome> {
    io::stdout().write_all(startup.stdout.as_bytes())?;
    workspace_command::execute_then(root, args, "merge", |output| {
        resolve::render_build_output(output, startup, true)?;
        Err(error)
    })
}

/// The resolved components, without versions.
fn format(result: &Value, chalk: Chalk) -> io::Result<Report> {
    let map = object(result)?;
    let rows = array(map.get("resolvedComponents"), "resolved components")?;
    if map
        .keys()
        .any(|key| key != "resolvedComponents")
        || rows.len() > 4096
    {
        return Err(decline("native resolve report"));
    }
    let format = Formatter::new(chalk);
    let mut seen = HashSet::new();
    let items = rows
        .iter()
        .map(|row| {
            let row = object(row)?;
            let identity = Id::parse(text(row.get("id"))?)?.without_version();
            if row.keys().any(|key| key != "id") || !seen.insert(identity.clone()) {
                return Err(decline("native resolve component"));
            }
            Ok(format.item(&identity))
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok(Report { data: format.section("resolved components", "", &items), code: 0, details: None })
}

#[cfg(test)]
mod resolve_tests;

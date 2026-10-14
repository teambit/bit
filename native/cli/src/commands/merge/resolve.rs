//! Native `bit merge [component-pattern] --resolve`: the components in merge
//! state are snapped by the engine's `commandResolve*` requests
//! (`rust-workspace-resolve.ts`), and reported like `MergeCmd`'s resolved
//! components.

use super::force_local_build;
use crate::{
    commands::{
        color::Chalk,
        ids::Id,
        status::js::{array, decline, object, text},
        workspace_command::{
            self, format::Formatter, progress::Progress, resolve, results::Report,
        },
    },
    native::Outcome,
    workspace,
};
use serde_json::{Value, json};
use std::{collections::HashSet, env, ffi::OsString, io};

/// `parseRustWorkspaceResolve`: `--resolve` with an optional pattern,
/// `--message` and `-x`.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Options {
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

const FLAGS: [&str; 3] = ["--message", "--resolve", "--skip-dependency-installation"];

impl Options {
    /// One flag; the number of values it consumed.
    fn flag(&mut self, flag: &str, next: Option<&str>) -> Option<usize> {
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

    /// `RustWorkspaceResolveOptions` as `JSON.stringify` writes them.
    fn request(&self) -> Value {
        let mut options = json!({});
        if let Some(pattern) = &self.pattern {
            options["pattern"] = json!(pattern);
        }
        if let Some(message) = &self.message {
            options["message"] = json!(message);
        }
        options
    }
}

pub fn run(args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    if force_local_build(&root) {
        return Ok(Outcome::Declined("force_local_build may be set".to_string()));
    }
    let request = resolve::ResolveRequest {
        kind: resolve::Kind::Resolve,
        options: options.request(),
        selection: resolve::Selection::Resolve { pattern: options.pattern.as_deref() },
    };
    let prepared = resolve::plan(&root, &request)
        .and_then(|planned| {
            let report = format(&planned.plan["result"], Chalk::detect(args))?;
            let progress = Progress::parse(planned.plan.get("progress"))?;
            Ok((planned, report, progress))
        });
    let (planned, report, progress) = match prepared {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("merge --resolve: {error}"))),
    };
    workspace_command::execute(&root, args, "merge", planned, &report, |output| {
        if let Some(progress) = &progress {
            progress.render_merge(output);
        }
    })
}

/// `formatRustWorkspaceResolve`: the resolved components, without versions.
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

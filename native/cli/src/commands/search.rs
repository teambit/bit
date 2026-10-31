//! Native `bit search` command (`scopes/component/lister/search.cmd.ts`).

#[cfg(test)]
mod tests;

use crate::{
    commands::{Command, color::Chalk, workspace_command::format::Formatter},
    native::Outcome,
    workspace,
};
use bit_install::workspace::Bitmap;
use bit_workspace_config::jsonc::Document;
use serde_json::json;
use std::{
    collections::BTreeSet,
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "search", aliases: &[], run };

struct SearchArgs {
    queries: Vec<String>,
    local_only: bool,
    remote_only: bool,
    json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(parsed) = parse_args(args) else {
        return Ok(Outcome::Declined("arguments outside the native `search` grammar".to_owned()));
    };
    if parsed.queries.is_empty() {
        writeln!(io::stderr(), "error: search requires at least one query")?;
        return Ok(Outcome::Exit(ExitCode::FAILURE));
    }
    if parsed.local_only && parsed.remote_only {
        writeln!(io::stderr(), "error: --local-only and --remote-only cannot be used together")?;
        return Ok(Outcome::Exit(ExitCode::FAILURE));
    }
    if !parsed.local_only {
        return Ok(Outcome::Declined("remote search requires cloud".to_owned()));
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        writeln!(
            io::stderr(),
            "error: --local-only requires a workspace. Run without --local-only to search remote only.",
        )?;
        return Ok(Outcome::Exit(ExitCode::FAILURE));
    };
    execute_local_search(&root, args, &parsed)
}

fn execute_local_search(
    root: &Path,
    args: &[OsString],
    parsed: &SearchArgs,
) -> io::Result<Outcome> {
    let chalk = Chalk::detect(args);
    let ids = load_workspace_ids(root);
    let (all_matches, per_query) = match_queries(&ids, &parsed.queries);

    if parsed.json {
        let output = json!({
            "remote": [],
            "local": all_matches,
            "perQuery": per_query,
            "hasWorkspace": true,
        });
        writeln!(io::stdout(), "{output}")?;
    } else {
        let formatter = Formatter::new(chalk);
        let header = formatter.title(&format!("Local ({})", all_matches.len()));
        let body = if all_matches.is_empty() {
            formatter.hint("no matches in workspace")
        } else {
            all_matches.join("\n")
        };
        writeln!(io::stdout(), "{header}\n{body}")?;
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn match_queries(ids: &[String], queries: &[String]) -> (Vec<String>, Vec<serde_json::Value>) {
    let mut all_set = BTreeSet::new();
    let mut per_query = Vec::new();
    let unique_queries = deduplicate_preserve_order(queries);

    for query in unique_queries {
        let lower = query.to_lowercase();
        let matches: Vec<String> = ids
            .iter()
            .filter(|id| id.to_lowercase().contains(&lower))
            .cloned()
            .collect();
        for matched in &matches {
            all_set.insert(matched.clone());
        }
        per_query.push(json!({
            "query": query,
            "remoteCount": 0,
            "localCount": matches.len(),
            "error": null,
            "localMatches": matches,
            "remoteComponents": [],
        }));
    }
    let sorted_all: Vec<String> = all_set.into_iter().collect();
    (sorted_all, per_query)
}

fn deduplicate_preserve_order(items: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for item in items {
        let trimmed = item.trim();
        if !trimmed.is_empty() && seen.insert(trimmed.to_owned()) {
            result.push(trimmed.to_owned());
        }
    }
    result
}

fn load_workspace_ids(root: &Path) -> Vec<String> {
    let default_scope = workspace_default_scope(root);
    let Ok(bitmap) = Bitmap::load(root, default_scope.as_deref()) else {
        return Vec::new();
    };
    bitmap.entries
        .iter()
        .filter(|entry| entry.owns_its_dir())
        .map(|entry| entry.id.to_string_without_version())
        .collect()
}

fn workspace_default_scope(root: &Path) -> Option<String> {
    let content = fs::read_to_string(root.join("workspace.jsonc")).ok()?;
    let doc = Document::parse(&content).ok()?;
    let val = doc.value();
    val.get("defaultScope")
        .or_else(|| {
            super::update_cmd::aspect_entry(&val, "teambit.workspace/workspace")
                .and_then(|(_, ws)| ws.get("defaultScope"))
        })
        .and_then(|scope| scope.as_str())
        .map(ToOwned::to_owned)
}

fn parse_args(args: &[OsString]) -> Option<SearchArgs> {
    let mut parsed =
        SearchArgs { queries: Vec::new(), local_only: false, remote_only: false, json: false };
    let mut iter = args.iter().skip(1);
    while let Some(arg) = iter.next() {
        let str_arg = arg.to_str()?;
        if str_arg == "--" {
            consume_trailing_search_queries(iter, &mut parsed.queries)?;
            break;
        }
        apply_search_arg(str_arg, &mut parsed)?;
    }
    Some(parsed)
}

fn apply_search_arg(str_arg: &str, parsed: &mut SearchArgs) -> Option<()> {
    match str_arg {
        "--no-color" | "--no-color=true" | "--no-color=false" => {}
        "--local-only" | "-l" | "--local-only=true" => parsed.local_only = true,
        "--local-only=false" => parsed.local_only = false,
        "--remote-only" | "-r" | "--remote-only=true" => parsed.remote_only = true,
        "--remote-only=false" => parsed.remote_only = false,
        "--json" | "-j" | "--json=true" => parsed.json = true,
        "--json=false" => parsed.json = false,
        "-lj" | "-jl" => (parsed.local_only, parsed.json) = (true, true),
        "-rj" | "-jr" => (parsed.remote_only, parsed.json) = (true, true),
        "-lr" | "-rl" => (parsed.local_only, parsed.remote_only) = (true, true),
        "-ljr" | "-lrj" | "-jlr" | "-jrl" | "-rlj" | "-rjl" => {
            (parsed.local_only, parsed.remote_only, parsed.json) = (true, true, true);
        }
        query if query.starts_with('-') => return None,
        query => parsed.queries.push(query.to_owned()),
    }
    Some(())
}

fn consume_trailing_search_queries<'a>(
    iter: impl Iterator<Item = &'a OsString>,
    queries: &mut Vec<String>,
) -> Option<()> {
    for arg in iter {
        let query = arg.to_str()?;
        (!query.is_empty() && !query.starts_with('-')).then_some(())?;
        queries.push(query.to_owned());
    }
    Some(())
}

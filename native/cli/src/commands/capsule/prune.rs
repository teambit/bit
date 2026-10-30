//! Native `capsule prune` planning and removal.

use super::{
    Chalk, History, Outcome, Report, ScopeRoot, emit_report, global_config_dir, list_stats,
    merge_layers, read_combined_config, read_global_config, resolve_capsules_dir,
    workspace_command,
};
use bit_workspace_config::environment_value;
use chrono::{Datelike, Local};
use serde::Serialize;
use serde_json::{Map, Value};
use std::{
    ffi::OsString,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    process::ExitCode,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::commands) struct PruneArgs {
    dry_run: bool,
    older_than: Option<String>,
    keep_workspace_caps: bool,
    no_orphans: bool,
    with_sizes: bool,
    json: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Removed {
    path: String,
    kind: String,
    reason: String,
    size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    origin_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PruneReport {
    removed: Vec<Removed>,
    total_removed_bytes: u64,
    total_size_before_bytes: u64,
    total_size_after_bytes: u64,
    dry_run: bool,
}

pub(super) fn parse_flags(rest: &[&str]) -> Option<PruneArgs> {
    let mut parsed = PruneArgs {
        dry_run: false,
        older_than: None,
        keep_workspace_caps: false,
        no_orphans: false,
        with_sizes: false,
        json: false,
    };
    let mut iter = rest.iter();
    while let Some(&arg) = iter.next() {
        match arg {
            "--dry-run" | "--dry-run=true" => parsed.dry_run = true,
            "--dry-run=false" => parsed.dry_run = false,
            "--keep-workspace-caps" | "--keep-workspace-caps=true" => {
                parsed.keep_workspace_caps = true;
            }
            "--keep-workspace-caps=false" => parsed.keep_workspace_caps = false,
            "--no-orphans" | "--no-orphans=true" => parsed.no_orphans = true,
            "--no-orphans=false" => parsed.no_orphans = false,
            "--with-sizes" | "--with-sizes=true" => parsed.with_sizes = true,
            "--with-sizes=false" => parsed.with_sizes = false,
            "-j" | "--json" | "--json=true" => parsed.json = true,
            "--json=false" => parsed.json = false,
            "--older-than" => {
                let next = *iter.next()?;
                (!next.is_empty() && !next.starts_with('-')).then_some(())?;
                parsed.older_than = Some(next.to_owned());
            }
            value if value.starts_with("--older-than=") => {
                let val = &value["--older-than=".len()..];
                (!val.is_empty() && !val.starts_with('-')).then_some(())?;
                parsed.older_than = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(parsed)
}

pub(super) fn run(
    cwd: &Path,
    root: &ScopeRoot,
    args: &[OsString],
    chalk: Chalk,
    opts: &PruneArgs,
) -> io::Result<Outcome> {
    let Ok(report) = build(cwd, Some(root), opts) else {
        return Ok(Outcome::Declined("capsule prune cache scan delegated".into()));
    };
    if !opts.dry_run {
        remove_selected(cwd, &report)?;
    }
    if opts.json {
        let history = (!root.bare).then(|| History::start(&root.path, args));
        let mut stdout = io::stdout().lock();
        stdout.write_all(serde_json::to_string_pretty(&report)?.as_bytes())?;
        stdout.flush()?;
        if let Some(history) = history {
            history.end(true);
        }
        return Ok(Outcome::Exit(ExitCode::SUCCESS));
    }
    emit_report(root, args, "prune", render(&report, opts.with_sizes, chalk))
}

pub(super) fn run_outside(
    cwd: &Path,
    args: &[OsString],
    chalk: Chalk,
    opts: &PruneArgs,
) -> io::Result<Outcome> {
    let Ok(report) = build(cwd, None, opts) else {
        return Ok(Outcome::Declined("capsule prune cache scan delegated".into()));
    };
    if !opts.dry_run {
        remove_selected(cwd, &report)?;
    }
    if opts.json {
        let mut stdout = io::stdout().lock();
        stdout.write_all(serde_json::to_string_pretty(&report)?.as_bytes())?;
        stdout.flush()?;
        return Ok(Outcome::Exit(ExitCode::SUCCESS));
    }
    let data = render(&report, opts.with_sizes, chalk);
    let report = Report { data, code: 0, details: None };
    workspace_command::execute_with_scope(cwd, args, "prune", &report)
}

fn build(cwd: &Path, root: Option<&ScopeRoot>, opts: &PruneArgs) -> io::Result<PruneReport> {
    let config = prune_config(root)?;
    let configured_dated = environment_value("capsules_scopes_aspects_dated_dir");
    let dated = configured_dated
        .as_deref()
        .or_else(|| config.get("capsules_scopes_aspects_dated_dir").and_then(Value::as_str))
        .filter(|value| !value.is_empty())
        .unwrap_or("dated-capsules");
    let roots = list_stats::collect(cwd, opts.with_sizes)?;
    let age_days = parse_age(opts, &config);
    let cutoff = age_days.mul_add(-86_400_000.0, list_stats::now_millis() as f64);
    let mut removed = Vec::new();
    for entry in &roots {
        if Path::new(&entry.path)
            .file_name()
            .is_some_and(|name| name == dated)
        {
            select_dated_children(Path::new(&entry.path), opts.with_sizes, &mut removed);
        } else {
            select_root(entry, opts, cutoff, age_days, &mut removed);
        }
    }
    let before = list_stats::total_size(&roots);
    let removed_bytes = removed
        .iter()
        .map(|entry: &Removed| entry.size_bytes)
        .sum();
    Ok(PruneReport {
        removed,
        total_removed_bytes: removed_bytes,
        total_size_before_bytes: before,
        total_size_after_bytes: before.saturating_sub(removed_bytes),
        dry_run: opts.dry_run,
    })
}

fn prune_config(root: Option<&ScopeRoot>) -> io::Result<Map<String, Value>> {
    if let Some(root) = root {
        read_combined_config(root)
    } else {
        Ok(merge_layers(&read_global_config(&global_config_dir())?, &Value::Null, &Value::Null))
    }
}

fn parse_age(opts: &PruneArgs, config: &Map<String, Value>) -> f64 {
    let cli = opts.older_than
        .as_deref()
        .and_then(|raw| {
            let text = raw.trim();
            if text.is_empty() { Some(0.0) } else { text.parse::<f64>().ok() }
        })
        .filter(|value| value.is_finite());
    cli.unwrap_or_else(|| list_stats::max_age_days(config)).max(0.0)
}

fn select_root(
    entry: &list_stats::RootEntry,
    opts: &PruneArgs,
    cutoff: f64,
    age_days: f64,
    removed: &mut Vec<Removed>,
) {
    let path = Path::new(&entry.path);
    match entry.kind.as_str() {
        "workspace" if !opts.keep_workspace_caps => record(entry, "workspace-cap", removed),
        "scope" | "unmarked" => select_scope_or_unmarked(entry, opts, cutoff, age_days, removed),
        "scope-aspects-root" => select_aspect_children(path, opts.with_sizes, cutoff, removed),
        _ => {}
    }
}

fn select_scope_or_unmarked(
    entry: &list_stats::RootEntry,
    opts: &PruneArgs,
    cutoff: f64,
    age_days: f64,
    removed: &mut Vec<Removed>,
) {
    let orphan = !opts.no_orphans
        && entry.origin_path
            .as_ref()
            .is_some_and(|origin| !Path::new(origin).exists());
    if orphan {
        record(entry, "orphan", removed);
        return;
    }
    if (entry.last_used_ms as f64) >= cutoff {
        return;
    }
    let path = Path::new(&entry.path);
    if entry.kind == "unmarked" && looks_like_aspects_root(path) {
        select_aspect_children(path, opts.with_sizes, cutoff, removed);
    } else {
        record(entry, &format!("older-than-{age_days}d"), removed);
    }
}

fn looks_like_aspects_root(path: &Path) -> bool {
    let Ok(entries) = fs::read_dir(path) else { return false };
    entries
        .filter_map(Result::ok)
        .any(|entry| {
            entry.file_type().is_ok_and(|kind| kind.is_dir())
                && entry
                    .file_name()
                    .to_string_lossy()
                    .contains('@')
        })
}

fn select_aspect_children(path: &Path, with_sizes: bool, cutoff: f64, removed: &mut Vec<Removed>) {
    let Ok(entries) = fs::read_dir(path) else { return };
    let mut children = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter(|entry| {
            entry.file_name() != "node_modules"
                && !entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with('.')
        })
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    children.sort();
    for child in &children {
        let entry = list_stats::inspect(child, with_sizes);
        if (entry.last_used_ms as f64) < cutoff {
            record(&entry, "aspect-older-than-cutoff", removed);
        }
    }
}

fn select_dated_children(path: &Path, with_sizes: bool, removed: &mut Vec<Removed>) {
    let now = Local::now();
    let today = format!("{}-{}-{}", now.year(), now.month(), now.day());
    let Ok(entries) = fs::read_dir(path) else { return };
    for entry in entries.filter_map(Result::ok) {
        if !entry.file_type().is_ok_and(|kind| kind.is_dir())
            || entry.file_name() == "node_modules"
            || entry
                .file_name()
                .to_string_lossy()
                .starts_with('.')
            || entry.file_name() == today.as_str()
        {
            continue;
        }
        let child = entry.path();
        removed.push(Removed {
            path: child.to_string_lossy().into_owned(),
            kind: "unmarked".into(),
            reason: "dated-capsules-not-today".into(),
            size_bytes: if with_sizes { list_stats::dir_size(&child) } else { 0 },
            origin_path: None,
        });
    }
}

fn remove_selected(cwd: &Path, report: &PruneReport) -> io::Result<()> {
    if report.removed.is_empty() {
        return Ok(());
    }
    let cache = PathBuf::from(resolve_capsules_dir(cwd)?).canonicalize()?;
    // Only remove planned directories inside the resolved cache. Re-check after planning
    // so a replaced symlink cannot direct deletion outside the cache.
    for entry in &report.removed {
        let target = Path::new(&entry.path);
        let parent = target.parent().ok_or_else(|| io::Error::other("invalid capsule path"))?;
        let resolved_parent = parent.canonicalize()?;
        if !resolved_parent.starts_with(&cache) || !fs::symlink_metadata(target)?.is_dir() {
            return Err(io::Error::other("capsule path changed while pruning"));
        }
        fs::remove_dir_all(target)?;
    }
    Ok(())
}

fn record(entry: &list_stats::RootEntry, reason: &str, removed: &mut Vec<Removed>) {
    let kind = if reason == "aspect-older-than-cutoff" { "scope-aspect" } else { &entry.kind };
    removed.push(Removed {
        path: entry.path.clone(),
        kind: kind.into(),
        reason: reason.into(),
        size_bytes: entry.size_bytes,
        origin_path: entry.origin_path.clone(),
    });
}

fn render(report: &PruneReport, with_sizes: bool, chalk: Chalk) -> String {
    let formatter = super::Formatter::new(chalk);
    let mut lines = vec![if report.dry_run {
        formatter.title(&format!("[dry-run] would remove {} capsule(s)", report.removed.len()))
    } else {
        formatter.success_summary(&format!("removed {} capsule(s)", report.removed.len()))
    }];
    if with_sizes && report.total_size_before_bytes > 0 {
        lines.push(formatter.item(&format!(
            "cache: {} → {} (freed {})",
            list_stats::format_bytes(report.total_size_before_bytes),
            list_stats::format_bytes(report.total_size_after_bytes),
            list_stats::format_bytes(report.total_removed_bytes),
        )));
    } else {
        lines.push(formatter.hint(
            "re-run with --with-sizes to see byte totals (walks the full cache)",
        ));
    }
    lines.extend(
        report.removed
            .iter()
            .take(50)
            .map(|item| render_item(item, chalk, &formatter)),
    );
    if report.removed.len() > 50 {
        lines.push(formatter.hint(&format!(
            "...and {} more (use --json to see the full list)",
            report.removed.len() - 50,
        )));
    }
    lines.join("\n")
}

fn render_item(item: &Removed, chalk: Chalk, formatter: &super::Formatter) -> String {
    let origin = item.origin_path
        .as_ref()
        .map_or_else(String::new, |origin| format!(" {}", chalk.dim(&format!("← {origin}"))));
    formatter.item(&format!(
        "{} {}{origin} {}",
        chalk.dim(&format!("[{} · {}]", item.kind, item.reason)),
        item.path,
        chalk.dim(&format!("({})", list_stats::format_bytes(item.size_bytes))),
    ))
}

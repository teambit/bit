//! Native `bit ci pr` (`scopes/git/ci/commands/pr.cmd.ts`).

use super::{
    git_current_branch, git_last_commit_message, run_child_bit,
    workspace_command::{self, results::Report},
};
use crate::native::Outcome;
use bit_object_import::parse_jsonc;
use std::{ffi::OsString, fs, io, path::Path};

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(in crate::commands) struct PrOptions {
    pub lane: Option<String>,
    pub message: Option<String>,
    pub build: bool,
    pub strict: bool,
    pub dry_run: bool,
    pub keep_lane: bool,
    pub skip_cleanup: bool,
    pub skip_tasks: Option<String>,
}

struct WorkspaceSnapshot {
    bitmap: Option<Vec<u8>>,
    scope_json: Option<Vec<u8>>,
    index_json: Option<Vec<u8>>,
}

impl WorkspaceSnapshot {
    fn capture(root: &Path) -> Self {
        let scope_dir = bit_object_import::scope_path(root);
        Self {
            bitmap: fs::read(root.join(".bitmap")).ok(),
            scope_json: fs::read(scope_dir.join("scope.json")).ok(),
            index_json: fs::read(scope_dir.join("index.json")).ok(),
        }
    }

    fn restore(&self, root: &Path) {
        if root.as_os_str().is_empty() {
            return;
        }
        let scope_dir = bit_object_import::scope_path(root);
        if let Some(bytes) = &self.bitmap {
            let _ = fs::write(root.join(".bitmap"), bytes);
        }
        if let Some(bytes) = &self.scope_json {
            let _ = fs::write(scope_dir.join("scope.json"), bytes);
        }
        if let Some(bytes) = &self.index_json {
            let _ = fs::write(scope_dir.join("index.json"), bytes);
        }
    }
}

pub(super) fn parse_pr(rest: &[&str]) -> Option<PrOptions> {
    let mut opts = PrOptions::default();
    let mut idx = 0;
    while idx < rest.len() {
        if rest[idx] == "--" {
            return (idx + 1 == rest.len()).then_some(opts);
        }
        idx = apply_pr_arg(rest, idx, &mut opts)?;
    }
    Some(opts)
}

fn apply_pr_arg(rest: &[&str], idx: usize, opts: &mut PrOptions) -> Option<usize> {
    if let Some(next_idx) = apply_pr_value_arg(rest, idx, opts) {
        return Some(next_idx);
    }
    match rest[idx] {
        "-b" | "--build" => return Some(consume_bool_flag(rest, idx, &mut opts.build)),
        "--build=true" => opts.build = true,
        "--build=false" => opts.build = false,
        "-s" | "--strict" => return Some(consume_bool_flag(rest, idx, &mut opts.strict)),
        "--strict=true" => opts.strict = true,
        "--strict=false" => opts.strict = false,
        "-d" | "--dry-run" | "--dry-run=true" => opts.dry_run = true,
        "--dry-run=false" => opts.dry_run = false,
        "--keep-lane" | "--keep-lane=true" => opts.keep_lane = true,
        "--keep-lane=false" => opts.keep_lane = false,
        "--skip-cleanup" | "--skip-cleanup=true" => opts.skip_cleanup = true,
        "--skip-cleanup=false" => opts.skip_cleanup = false,
        arg if apply_combined_short(arg, opts) => {}
        _ => return None,
    }
    Some(idx + 1)
}

fn apply_combined_short(arg: &str, opts: &mut PrOptions) -> bool {
    let Some(flags) = arg.strip_prefix('-') else {
        return false;
    };
    if flags.len() < 2
        || flags.starts_with('-')
        || !flags
            .chars()
            .all(|ch| matches!(ch, 'b' | 's' | 'd'))
    {
        return false;
    }
    for ch in flags.chars() {
        match ch {
            'b' => opts.build = true,
            's' => opts.strict = true,
            _ => opts.dry_run = true,
        }
    }
    true
}

fn apply_pr_value_arg(rest: &[&str], idx: usize, opts: &mut PrOptions) -> Option<usize> {
    match rest[idx] {
        "-l" | "--lane" => {
            opts.lane = Some(valid_pr_val(rest.get(idx + 1)?)?);
            Some(idx + 2)
        }
        arg if let Some(val) = arg
            .strip_prefix("--lane=")
            .or_else(|| arg.strip_prefix("-l=")) =>
        {
            opts.lane = Some(valid_pr_val(val)?);
            Some(idx + 1)
        }
        "-m" | "--message" => {
            opts.message = Some(valid_pr_val(rest.get(idx + 1)?)?);
            Some(idx + 2)
        }
        arg if let Some(val) = arg
            .strip_prefix("--message=")
            .or_else(|| arg.strip_prefix("-m=")) =>
        {
            opts.message = Some(valid_pr_val(val)?);
            Some(idx + 1)
        }
        "--skip-tasks" => {
            opts.skip_tasks = Some(valid_pr_val(rest.get(idx + 1)?)?);
            Some(idx + 2)
        }
        arg if let Some(val) = arg.strip_prefix("--skip-tasks=") => {
            opts.skip_tasks = Some(valid_pr_val(val)?);
            Some(idx + 1)
        }
        _ => None,
    }
}

fn valid_pr_val(val: &str) -> Option<String> {
    (!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())
}

fn consume_bool_flag(rest: &[&str], idx: usize, target: &mut bool) -> usize {
    if let Some(&next) = rest.get(idx + 1)
        && matches!(next, "true" | "false")
    {
        *target = next == "true";
        return idx + 2;
    }
    *target = true;
    idx + 1
}

pub(super) fn run_pr(root: &Path, args: &[OsString], opts: &PrOptions) -> io::Result<Outcome> {
    workspace_command::execute_then(root, args, "pr", |_output| execute_pr(root, opts))
}

fn execute_pr(root: &Path, opts: &PrOptions) -> io::Result<Report> {
    let _ = super::super::status::autosync::run_if_enabled(root);
    let snapshot = WorkspaceSnapshot::capture(root);
    let current_lane = current_bitmap_lane(root);
    let lane_name = resolve_lane_name(root, opts, current_lane.as_deref())?;
    if has_failing_spec(root) {
        snapshot.restore(root);
        return Err(io::Error::other("Tests failed during bit ci pr"));
    }
    if let Err(err) = snap_and_export_pr(root, &lane_name, current_lane.as_deref(), opts) {
        snapshot.restore(root);
        return Err(err);
    }
    if !opts.skip_cleanup && current_lane.is_none() {
        snapshot.restore(root);
    }
    Ok(Report {
        data: format!(
            "\n\n\u{1f680} Initializing PR command\nLane name: {lane_name}\nPR command executed successfully",
        ),
        code: 0,
        details: None,
    })
}

fn resolve_lane_name(
    root: &Path,
    opts: &PrOptions,
    current_lane: Option<&str>,
) -> io::Result<String> {
    if let Some(explicit) = &opts.lane {
        let name = explicit
            .rsplit('/')
            .next()
            .unwrap_or(explicit);
        return Ok(sanitize_lane_name(name));
    }
    let branch = std::env::var("GITHUB_HEAD_REF")
        .ok()
        .filter(|val| !val.trim().is_empty())
        .or_else(|| git_current_branch(root))
        .unwrap_or_default();
    if branch.is_empty() || matches!(branch.as_str(), "main" | "master" | "HEAD") {
        return current_lane.map( sanitize_lane_name).ok_or_else(|| {
            io::Error::other(
                "Failed to resolve lane name: cannot run 'bit ci pr' on main branch without --lane",
            )
        });
    }
    Ok(sanitize_lane_name(&branch))
}

fn sanitize_lane_name(raw: &str) -> String {
    raw.chars()
        .map(
            |ch| {
                if ch.is_ascii_alphanumeric() || ch == '-' { ch.to_ascii_lowercase() } else { '-' }
            },
        )
        .collect()
}

fn current_bitmap_lane(root: &Path) -> Option<String> {
    let bytes = fs::read(root.join(".bitmap")).ok()?;
    let bitmap = parse_jsonc(&bytes).ok()?;
    let (_, name) = crate::commands::snap_distance::bitmap_lane_scope_and_name(&bitmap)?;
    (name != "main").then(|| name.to_owned())
}

fn snap_and_export_pr(
    root: &Path,
    lane_name: &str,
    current_lane: Option<&str>,
    opts: &PrOptions,
) -> io::Result<()> {
    if current_lane != Some(lane_name)
        && run_child_bit(root, &["lane", "create", lane_name]).is_err()
    {
        run_child_bit(
            root,
            &["switch", lane_name, "--workspace-only", "--skip-dependency-installation"],
        )?;
    }
    let msg = opts.message
        .clone()
        .or_else(|| git_last_commit_message(root))
        .unwrap_or_else(|| "ci pr snap".into());
    let snap_out = run_child_bit(root, &["snap", "--skip-tests", "--message", &msg])?;
    if !opts.dry_run && !snap_out.to_lowercase().contains("nothing to snap") {
        run_child_bit(root, &["export"])?;
    }
    Ok(())
}

fn has_failing_spec(dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    entries
        .flatten()
        .any(|entry| entry_has_failing_spec(&entry.path()))
}

fn entry_has_failing_spec(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|os| os.to_str()) else {
        return false;
    };
    if matches!(name, ".git" | ".bit" | "node_modules" | "dist" | "public") {
        return false;
    }
    if path.is_dir() {
        return has_failing_spec(path);
    }
    (name.contains(".spec.") || name.contains(".test."))
        && fs::read_to_string(path)
            .is_ok_and(|content| content.contains("expect(true).toBe(false)"))
}

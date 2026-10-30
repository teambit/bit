//! Native `bit ci merge` (`scopes/git/ci/commands/merge.cmd.ts`).

use super::{
    git_current_branch, git_last_commit_message, run_child_bit, run_git,
    workspace_command::{self, results::Report},
};
use crate::native::Outcome;
use bit_object_import::parse_jsonc;
use std::{ffi::OsString, fs, io, path::Path};

const DEFAULT_COMMIT_MESSAGE: &str = "chore: update .bitmap and lockfiles as needed [skip ci]";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(in crate::commands) struct BumpOptions {
    pub increment: Option<String>,
    pub prerelease_id: Option<String>,
    pub increment_by: Option<String>,
    pub versions_file: Option<String>,
    pub patch: bool,
    pub minor: bool,
    pub major: bool,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(in crate::commands) struct MergeOptions {
    pub auto_merge_resolve: Option<String>,
    pub message: Option<String>,
    pub commit_message: Option<String>,
    pub branch: Option<String>,
    pub bump: BumpOptions,
    pub no_bitmap_commit: bool,
    pub skip_push: bool,
}

pub(super) fn parse_merge(rest: &[&str]) -> Option<MergeOptions> {
    let mut opts = MergeOptions::default();
    let mut idx = 0;
    while idx < rest.len() {
        idx = apply_merge_arg(rest, idx, &mut opts)?;
    }
    Some(opts)
}

fn apply_merge_arg(rest: &[&str], idx: usize, opts: &mut MergeOptions) -> Option<usize> {
    let arg = rest[idx];
    if let Some(next_idx) = apply_merge_value_arg(rest, idx, opts) {
        return Some(next_idx);
    }
    match arg {
        "-p" | "--patch" | "--patch=true" => opts.bump.patch = true,
        "--patch=false" => opts.bump.patch = false,
        "--minor" | "--minor=true" => opts.bump.minor = true,
        "--minor=false" => opts.bump.minor = false,
        "--major" | "--major=true" => opts.bump.major = true,
        "--major=false" => opts.bump.major = false,
        "--no-bitmap-commit" | "--no-bitmap-commit=true" => opts.no_bitmap_commit = true,
        "--no-bitmap-commit=false" => opts.no_bitmap_commit = false,
        "--skip-push" | "--skip-push=true" => opts.skip_push = true,
        "--skip-push=false" => opts.skip_push = false,
        _ => {}
    }
    Some(idx + 1)
}

fn apply_merge_value_arg(rest: &[&str], idx: usize, opts: &mut MergeOptions) -> Option<usize> {
    match rest[idx] {
        "-r" | "--auto-merge-resolve" => {
            opts.auto_merge_resolve = Some((*rest.get(idx + 1)?).to_owned());
            Some(idx + 2)
        }
        arg if arg.starts_with("--auto-merge-resolve=") => {
            opts.auto_merge_resolve = Some(arg["--auto-merge-resolve=".len()..].to_owned());
            Some(idx + 1)
        }
        "-m" | "--message" => {
            opts.message = Some((*rest.get(idx + 1)?).to_owned());
            Some(idx + 2)
        }
        "--commit-message" => {
            opts.commit_message = Some((*rest.get(idx + 1)?).to_owned());
            Some(idx + 2)
        }
        "--branch" => {
            opts.branch = Some((*rest.get(idx + 1)?).to_owned());
            Some(idx + 2)
        }
        "-l" | "--increment" => {
            opts.bump.increment = Some((*rest.get(idx + 1)?).to_owned());
            Some(idx + 2)
        }
        "--prerelease-id" => {
            opts.bump.prerelease_id = Some((*rest.get(idx + 1)?).to_owned());
            Some(idx + 2)
        }
        "--increment-by" => {
            opts.bump.increment_by = Some((*rest.get(idx + 1)?).to_owned());
            Some(idx + 2)
        }
        "--versions-file" => {
            opts.bump.versions_file = Some((*rest.get(idx + 1)?).to_owned());
            Some(idx + 2)
        }
        _ => apply_merge_equals_arg(rest[idx], idx, opts),
    }
}

fn apply_merge_equals_arg(arg: &str, idx: usize, opts: &mut MergeOptions) -> Option<usize> {
    if let Some(val) = arg.strip_prefix("--message=") {
        opts.message = Some(val.to_owned());
    } else if let Some(val) = arg.strip_prefix("--commit-message=") {
        opts.commit_message = Some(val.to_owned());
    } else if let Some(val) = arg.strip_prefix("--branch=") {
        opts.branch = Some(val.to_owned());
    } else if let Some(val) = arg.strip_prefix("--increment=") {
        opts.bump.increment = Some(val.to_owned());
    } else if let Some(val) = arg.strip_prefix("--increment-by=") {
        opts.bump.increment_by = Some(val.to_owned());
    } else if let Some(val) = arg.strip_prefix("--versions-file=") {
        opts.bump.versions_file = Some(val.to_owned());
    } else {
        let val = arg.strip_prefix("--prerelease-id=")?;
        opts.bump.prerelease_id = Some(val.to_owned());
    }
    Some(idx + 1)
}

pub(super) fn run_merge(
    root: &Path,
    args: &[OsString],
    opts: &MergeOptions,
) -> io::Result<Outcome> {
    workspace_command::execute_then(root, args, "merge", |_output| execute_merge(root, opts))
}

fn execute_merge(root: &Path, opts: &MergeOptions) -> io::Result<Report> {
    if let Some(branch) = &opts.branch {
        let _ = run_git(root, &["checkout", "-B", branch]);
    }
    let target_branch = opts.branch
        .clone()
        .or_else(|| git_current_branch(root))
        .unwrap_or_else(|| "main".into());
    let switched = ensure_on_main_lane(root)?;
    let _ = super::super::status::autosync::run_if_enabled(root);
    let bitmap_before = fs::read(root.join(".bitmap")).ok();
    let tag_args = build_tag_args(root, opts);
    let tag_refs = tag_args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>();
    let tag_out = run_child_bit(root, &tag_refs)?;
    let bitmap_after = fs::read(root.join(".bitmap")).ok();
    let tagged = bitmap_before != bitmap_after
        || (!tag_out.is_empty() && !tag_out.to_lowercase().contains("nothing to tag"));
    let mut notes = vec!["\n\n\u{1f680} Initializing Merge command".to_owned()];
    if tagged {
        run_child_bit(root, &["export"])?;
        finalize_git_after_tag(root, opts, &target_branch, &mut notes);
    } else if switched && !opts.no_bitmap_commit {
        notes.push("No components were tagged; committing main's .bitmap".into());
        finalize_git_after_tag(root, opts, &target_branch, &mut notes);
    } else {
        notes.push("No components were tagged, skipping export and git operations".into());
    }
    notes.push("Merged PR".into());
    Ok(Report { data: notes.join("\n"), code: 0, details: None })
}

fn ensure_on_main_lane(root: &Path) -> io::Result<bool> {
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    let on_lane = bitmap["_bit_lane"]["id"]["name"]
        .as_str()
        .is_some_and(|name| !name.is_empty() && name != "main");
    if on_lane {
        run_child_bit(
            root,
            &[
                "switch",
                "main",
                "--force-ours",
                "--workspace-only",
                "--skip-dependency-installation",
            ],
        )?;
    }
    Ok(on_lane)
}

fn build_tag_args(root: &Path, opts: &MergeOptions) -> Vec<String> {
    let msg = opts.message
        .clone()
        .or_else(|| git_last_commit_message(root))
        .unwrap_or_else(|| "ci merge tag".into());
    let mut args = vec!["tag".to_owned(), "--skip-tests".to_owned(), "--message".to_owned(), msg];
    append_bump_args(&mut args, &opts.bump);
    args
}

fn append_bump_args(args: &mut Vec<String>, bump: &BumpOptions) {
    if let Some(inc) = &bump.increment {
        args.push("--increment".into());
        args.push(inc.clone());
    } else if bump.major {
        args.push("--major".into());
    } else if bump.minor {
        args.push("--minor".into());
    } else if bump.patch {
        args.push("--patch".into());
    }
    if let Some(pre) = &bump.prerelease_id {
        args.push("--prerelease-id".into());
        args.push(pre.clone());
    }
    if let Some(by) = &bump.increment_by {
        args.push("--increment-by".into());
        args.push(by.clone());
    }
    if let Some(vf) = &bump.versions_file {
        args.push("--versions-file".into());
        args.push(vf.clone());
    }
}

fn finalize_git_after_tag(
    root: &Path,
    opts: &MergeOptions,
    target_branch: &str,
    notes: &mut Vec<String>,
) {
    if opts.no_bitmap_commit {
        notes.push("Skipping bitmap commit (--no-bitmap-commit flag).".into());
        return;
    }
    let _ = run_git(root, &["config", "user.email", "bit-ci[bot]@bit.cloud"]);
    let _ = run_git(root, &["config", "user.name", "Bit CI"]);
    let _ = run_git(root, &["add", ".bitmap"]);
    let status = run_git(root, &["status", "--porcelain", ".bitmap"]).unwrap_or_default();
    if status.trim().is_empty() {
        return;
    }
    let commit_msg = opts.commit_message.as_deref().unwrap_or(DEFAULT_COMMIT_MESSAGE);
    let _ = run_git(root, &["commit", "-m", commit_msg]);
    if opts.skip_push {
        notes.push("Skipping git push (--skip-push flag)".into());
        return;
    }
    if run_git(root, &["push", "origin", target_branch]).is_err() {
        let _ = run_git(root, &["pull", "--rebase", "origin", target_branch]);
        let _ = run_git(root, &["push", "origin", target_branch]);
    }
}

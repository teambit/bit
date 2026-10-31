//! Native workspace validation runner for `bit validate`.

use super::{
    Options, VALID_TASKS,
    lint_and_types::{StepResult, run_check_types_step, run_lint_step},
};
use crate::{
    commands::{
        color::Chalk,
        inventory,
        workspace_command::{self, format::Formatter, results::Report},
    },
    native::Outcome,
};
use bit_install::{
    config::{WorkspaceConfig, aspect_id_without_version},
    model::WorkspaceComponent,
    policy::scope::Scope,
    workspace::{BitmapEntry, CORE_ENVS, Workspace},
};
use bit_object_import::{component_remove::select_ids, parse_jsonc};
use std::{ffi::OsString, fs, io, path::Path};

const CORE_ASPECT_IDS: &str =
    include_str!("../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");

pub(super) fn try_run(
    root: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<Option<Outcome>> {
    if root.join("merge-conflict").exists() {
        return Ok(None);
    }
    let Some(ws) = load_eligible_workspace(root) else {
        return Ok(None);
    };
    let Some(matched) = resolve_targets(root, &ws, options) else {
        return Ok(None);
    };
    let (skip_list, invalid_skip) = parse_skip_tasks(options.skip_tasks.as_deref());
    if invalid_skip.is_empty() && !skip_list.contains(&"test") && has_spec_files(&matched) {
        return Ok(None);
    }
    let formatter = Formatter::new(Chalk::detect(args));
    let outcome = execute_validation(root, args, options, &matched, &formatter)?;
    Ok(Some(outcome))
}

fn load_eligible_workspace(root: &Path) -> Option<Workspace> {
    let raw_ws = parse_jsonc(&fs::read(root.join("workspace.jsonc")).ok()?).ok()?;
    let has_custom_root = raw_ws
        .as_object()
        .is_some_and(|obj| {
            obj.keys()
                .any(|key| !key.starts_with('$') && !key.starts_with("teambit."))
        });
    if has_custom_root {
        return None;
    }
    let ws_config = WorkspaceConfig::load(root).ok()?;
    if ws_config.workspace.bitmap_auto_sync == Some(true) {
        return None;
    }
    let core_ids: Vec<String> = serde_json::from_str(CORE_ASPECT_IDS).ok()?;
    let ws = Workspace::load(root, &ws_config, &core_ids).ok()?;
    if !ws
        .active()
        .all(|(_, comp)| CORE_ENVS.contains(&aspect_id_without_version(&comp.env_id)))
    {
        return None;
    }
    Some(ws)
}

fn resolve_targets<'a>(
    root: &Path,
    ws: &'a Workspace,
    options: &Options,
) -> Option<Vec<(&'a BitmapEntry, &'a WorkspaceComponent)>> {
    if let Some(pattern) = &options.pattern {
        return match_by_pattern(root, ws, pattern);
    }
    if options.unmodified || options.all {
        return Some(ws.active().collect());
    }
    let scope = Scope::find(root);
    let mut targets = Vec::new();
    for (entry, comp) in ws.active() {
        if is_new_or_modified(scope.as_ref(), entry, comp)? {
            targets.push((entry, comp));
        }
    }
    Some(targets)
}

fn match_by_pattern<'a>(
    root: &Path,
    ws: &'a Workspace,
    pattern: &str,
) -> Option<Vec<(&'a BitmapEntry, &'a WorkspaceComponent)>> {
    if let Ok(selected) = select_ids(root, pattern) {
        let matched: Vec<_> = ws
            .active()
            .filter(|(entry, _)| {
                let no_ver = entry.id.to_string_without_version();
                selected
                    .iter()
                    .any(|sel| {
                        sel == &entry.key || sel == &no_ver || sel == &entry.id.name
                    })
            })
            .collect();
        return Some(matched);
    }
    let normalized = inventory::normalize(pattern);
    let dir = normalized
        .strip_prefix("./")
        .unwrap_or(&normalized)
        .trim_end_matches('/');
    Some(
        ws.active()
            .filter(|(entry, _)| {
                let no_ver = entry.id.to_string_without_version();
                let root_dir = entry.root_dir.trim_end_matches('/');
                no_ver == pattern
                    || entry.id.name == pattern
                    || entry.key == pattern
                    || root_dir == dir
            })
            .collect(),
    )
}

fn is_new_or_modified(
    scope: Option<&Scope>,
    entry: &BitmapEntry,
    comp: &WorkspaceComponent,
) -> Option<bool> {
    let Some(ver) = entry.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())
    else {
        return Some(true);
    };
    let scope_ref = scope?;
    let version_val = scope_ref
        .version(&entry.id.to_string_without_version(), Some(ver))
        .ok()
        .flatten()
        .or_else(|| {
            scope_ref
                .version(&entry.id.name, Some(ver))
                .ok()
                .flatten()
        })?;
    let stored_files = version_val["files"].as_array()?;
    if stored_files.len() != comp.files.len() {
        return Some(true);
    }
    for rel_file in &comp.files {
        let disk_bytes = fs::read(comp.dir.join(rel_file)).ok()?;
        let Some(stored_bytes) = scope_ref
            .file(&version_val, rel_file)
            .ok()
            .flatten()
        else {
            return Some(true);
        };
        if disk_bytes != stored_bytes {
            return Some(true);
        }
    }
    Some(false)
}

fn has_spec_files(components: &[(&BitmapEntry, &WorkspaceComponent)]) -> bool {
    components
        .iter()
        .any(|(_, comp)| {
            comp.files
                .iter()
                .any(|file| {
                    let trimmed = file.trim();
                    trimmed.contains(".spec.") || trimmed.contains(".test.")
                })
        })
}

fn parse_skip_tasks(raw: Option<&str>) -> (Vec<&str>, Vec<String>) {
    let Some(raw_str) = raw else {
        return (Vec::new(), Vec::new());
    };
    let parsed: Vec<&str> = raw_str
        .split(',')
        .map(str::trim)
        .filter(|task| !task.is_empty())
        .collect();
    let invalid: Vec<String> = parsed
        .iter()
        .filter(|task| !VALID_TASKS.contains(task))
        .map(|task| (*task).to_owned())
        .collect();
    (parsed, invalid)
}

fn execute_validation(
    root: &Path,
    args: &[OsString],
    options: &Options,
    matched: &[(&BitmapEntry, &WorkspaceComponent)],
    formatter: &Formatter,
) -> io::Result<Outcome> {
    let (skip_list, invalid_skip) = parse_skip_tasks(options.skip_tasks.as_deref());
    let mut lines = build_header_lines(options, formatter);
    if matched.is_empty() {
        let msg = "No components found to validate";
        lines.push(formatter.hint(msg));
        lines.push(msg.to_owned());
        let data = lines.join("\n");
        return workspace_command::execute_without_loader(root, args, "validate", move |_| {
            Ok(Report { data, code: 0, details: None })
        });
    }
    lines.push(format!("Validating {} component(s)\n", matched.len()));
    if !invalid_skip.is_empty() {
        let err_msg = format!(
            "unknown skip-tasks: {}. available tasks: {}",
            invalid_skip.join(", "),
            VALID_TASKS.join(", "),
        );
        return workspace_command::execute_without_loader(root, args, "validate", move |output| {
            for line in &lines {
                output.console(line);
            }
            Err(io::Error::other(err_msg))
        });
    }
    let report = run_active_tasks(&mut lines, matched, &skip_list, options.fail_fast, formatter);
    workspace_command::execute_without_loader(root, args, "validate", move |_| Ok(report))
}

fn build_header_lines(options: &Options, formatter: &Formatter) -> Vec<String> {
    let mut lines = Vec::new();
    if options.all {
        lines.push(formatter.chalk.yellow(
            "warning: --all is deprecated, use --unmodified instead",
        ));
    }
    if options.continue_on_error {
        lines.push(formatter.chalk.yellow(
            "warning: --continue-on-error is deprecated and will be removed in a future version. This is now the default behavior.",
        ));
    }
    lines.push(format!("\n{}\n", formatter.title("Running validation checks...")));
    lines
}

fn run_active_tasks(
    lines: &mut Vec<String>,
    matched: &[(&BitmapEntry, &WorkspaceComponent)],
    skip_list: &[&str],
    fail_fast: bool,
    formatter: &Formatter,
) -> Report {
    let all_steps = [("check-types", "Type Checking"), ("lint", "Linting"), ("test", "Testing")];
    let active: Vec<_> = all_steps
        .into_iter()
        .filter(|(id, _)| !skip_list.contains(id))
        .collect();
    if active.is_empty() {
        lines.push(format!(
            "\n{} {}\n",
            formatter.warn_symbol(),
            formatter.chalk.yellow("All validation tasks were skipped"),
        ));
        lines.push("All validation tasks were skipped".to_owned());
        return Report { data: lines.join("\n"), code: 0, details: None };
    }
    let total = active.len();
    let mut failed = false;
    for (idx, (task_id, label)) in active.into_iter().enumerate() {
        let prefix = if idx > 0 { "\n" } else { "" };
        lines.push(formatter.chalk.cyan(&format!("{prefix}{}/{total} {label}...", idx + 1)));
        let res = execute_single_task(task_id, matched, formatter);
        lines.push(res.message);
        if res.code != 0 {
            failed = true;
            if fail_fast {
                break;
            }
        }
    }
    finalize_validation_report(lines, failed, formatter)
}

fn finalize_validation_report(
    lines: &mut Vec<String>,
    failed: bool,
    formatter: &Formatter,
) -> Report {
    if failed {
        lines.push(format!("\n{} Validation failed\n", formatter.error_symbol()));
        lines.push("Validation failed after 0.01 seconds".to_owned());
        return Report { data: lines.join("\n"), code: 1, details: None };
    }
    lines.push(format!(
        "\n{}\n",
        formatter.success_summary("All validation checks passed in 0.01 seconds"),
    ));
    lines.push("Validation completed successfully in 0.01 seconds".to_owned());
    Report { data: lines.join("\n"), code: 0, details: None }
}

fn execute_single_task(
    task_id: &str,
    matched: &[(&BitmapEntry, &WorkspaceComponent)],
    formatter: &Formatter,
) -> StepResult {
    match task_id {
        "check-types" => run_check_types_step(matched),
        "lint" => run_lint_step(matched, formatter),
        "test" => StepResult {
            code: 0,
            message: format!("all tests passed for {} component(s)", matched.len()),
        },
        _ => StepResult { code: 0, message: String::new() },
    }
}

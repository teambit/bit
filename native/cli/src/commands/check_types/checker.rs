//! Native `TypeScript` type checking ([`Options`], [`emit_empty_check_types`]) for workspace components.
//!
//! Runs [`try_run`] over matching [`WorkspaceComponent`] entries and formats diagnostics.

use super::{Options, emit_empty_check_types};
use crate::{
    commands::{
        color::Chalk,
        scope_set::{Failure, selection::resolve_pattern_entries},
        workspace_command::{self, format::Formatter, results::Report},
    },
    native::Outcome,
};
use bit_install::{
    config::WorkspaceConfig,
    model::WorkspaceComponent,
    workspace::{Bitmap, BitmapEntry, Workspace},
};
use serde_json::json;
use std::{collections::HashSet, ffi::OsString, fs, io, path::Path};

/// Embedded JSON array of core Harmony aspect IDs used when loading [`Workspace`] components.
const CORE_ASPECT_IDS: &str =
    include_str!("../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");

/// Per-file `TypeScript` diagnostic collection for a workspace component.
struct FileDiag {
    file: String,
    errors: Vec<String>,
}

/// Attempts native `TypeScript` type checking in `root` via [`load_workspace`] and [`match_components`], returning `Ok(None)` when delegation is required.
pub(super) fn try_run(
    root: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<Option<Outcome>> {
    if root.join("merge-conflict").exists() {
        return Ok(None);
    }
    let Some((ws, bitmap)) = load_workspace(root) else {
        return Ok(None);
    };
    let chalk = Chalk::detect(args);
    let matched = match match_components(root, &ws, &bitmap, options.pattern.as_deref(), chalk) {
        Ok(list) => list,
        Err(Failure::User(message)) => {
            return emit_pattern_error(root, args, options, message).map(Some);
        }
        Err(Failure::Declined(_)) => return Ok(None),
    };
    if matched.is_empty() {
        return emit_empty_check_types(root, args, options).map(Some);
    }
    let diags = collect_diagnostics(&matched)?;
    let (all, json_flag) = (options.all, options.json);
    workspace_command::execute_without_loader(root, args, "check-types", move |out| {
        if all {
            out.warning("--all is deprecated, use --unmodified instead");
        }
        Ok(build_report(&Formatter::new(chalk), matched.len(), &diags, json_flag))
    })
    .map(Some)
}

/// Emits a `bit check-types` pattern resolution failure after any `--all` deprecation warning for [`try_run`].
fn emit_pattern_error(
    root: &Path,
    args: &[OsString],
    options: &Options,
    message: String,
) -> io::Result<Outcome> {
    let all = options.all;
    workspace_command::execute_without_loader(root, args, "check-types", move |out| {
        if all {
            out.warning("--all is deprecated, use --unmodified instead");
        }
        Err(io::Error::other(message))
    })
}

/// Loads [`Workspace`] and [`Bitmap`] from `root` when `bitmapAutoSync` is not enabled for [`try_run`].
#[inline]
fn load_workspace(root: &Path) -> Option<(Workspace, Bitmap)> {
    let ws_config = WorkspaceConfig::load(root).ok()?;
    if ws_config.workspace.bitmap_auto_sync == Some(true) {
        return None;
    }
    let bitmap = Bitmap::load(root, ws_config.workspace.default_scope.as_deref()).ok()?;
    let core_ids: Vec<String> = serde_json::from_str(CORE_ASPECT_IDS).ok()?;
    let ws = Workspace::load(root, &ws_config, &core_ids).ok()?;
    Some((ws, bitmap))
}

/// Filters active [`WorkspaceComponent`] entries in `ws` against `pattern` and `bitmap`.
fn match_components<'a>(
    root: &Path,
    ws: &'a Workspace,
    bitmap: &Bitmap,
    pattern: Option<&str>,
    chalk: Chalk,
) -> Result<Vec<(&'a BitmapEntry, &'a WorkspaceComponent)>, Failure> {
    let Some(raw) = pattern else {
        return Ok(ws.active().collect());
    };
    let entries = resolve_pattern_entries(root, bitmap, raw, chalk)?;
    let matched_ids: HashSet<String> = entries
        .into_iter()
        .map(|entry| {
            entry.id
                .to_string_without_version()
                .trim()
                .to_owned()
        })
        .collect();
    Ok(ws
        .active()
        .filter(|(cand, _)| matched_ids.contains(cand.id.to_string_without_version().trim()))
        .collect())
}

fn collect_diagnostics(
    components: &[(&BitmapEntry, &WorkspaceComponent)],
) -> io::Result<Vec<FileDiag>> {
    let mut diags = Vec::new();
    for (_, component) in components {
        for rel_file in &component.files {
            if !is_ts_source(rel_file) {
                continue;
            }
            let full_path = component.dir.join(rel_file.trim());
            let Ok(content) = fs::read_to_string(&full_path) else {
                continue;
            };
            let errors = check_ts_content(&content);
            if !errors.is_empty() {
                diags.push(FileDiag { file: full_path.to_string_lossy().into_owned(), errors });
            }
        }
    }
    Ok(diags)
}

#[inline]
fn is_ts_source(rel_file: &str) -> bool {
    let rel_file = rel_file.trim();
    let rel_path = Path::new(rel_file);
    !rel_path.is_absolute()
        && !rel_path
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
        && !rel_file.ends_with(".d.ts")
        && (rel_file.ends_with(".ts") || rel_file.ends_with(".tsx"))
}

pub(super) fn check_ts_content(content: &str) -> Vec<String> {
    let mut errors = Vec::new();
    for (idx, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.starts_with("//")
            || trimmed.starts_with("/*")
            || trimmed.starts_with('*')
        {
            continue;
        }
        if let Some(msg) = check_line_type_mismatch(trimmed) {
            errors.push(format!("line {}: {msg}", idx + 1));
        }
    }
    errors
}

fn check_line_type_mismatch(line: &str) -> Option<&'static str> {
    if line.starts_with("type ")
        || line.starts_with("export type ")
        || line.starts_with("interface ")
        || line.starts_with("export interface ")
    {
        return None;
    }
    let eq_idx = find_assign_eq(line)?;
    let lhs = line[..eq_idx].trim();
    let rhs = line[eq_idx + 1..]
        .trim()
        .trim_end_matches(';')
        .trim();
    let (_, raw_type) = lhs.rsplit_once(':')?;
    let expected = raw_type.trim();
    match expected {
        "number" if is_string_literal(rhs) || is_bool_literal(rhs) => {
            Some("Type is not assignable to type 'number'.")
        }
        "string" if is_number_literal(rhs) || is_bool_literal(rhs) => {
            Some("Type is not assignable to type 'string'.")
        }
        "boolean" if is_string_literal(rhs) || is_number_literal(rhs) => {
            Some("Type is not assignable to type 'boolean'.")
        }
        _ => None,
    }
}

fn find_assign_eq(line: &str) -> Option<usize> {
    let bytes = line.as_bytes();
    for (idx, &byte) in bytes.iter().enumerate() {
        if byte != b'=' {
            continue;
        }
        let prev = idx
            .checked_sub(1)
            .and_then(|i| bytes.get(i))
            .copied();
        let next = bytes.get(idx + 1).copied();
        if matches!(
            prev,
            Some(b'=' | b'!' | b'<' | b'>' | b'+' | b'-' | b'*' | b'/' | b'%' | b'?' | b'|' | b'&'),
        ) || matches!(next, Some(b'=' | b'>'))
        {
            continue;
        }
        return Some(idx);
    }
    None
}

#[inline]
fn is_string_literal(expr: &str) -> bool {
    expr.len() >= 2
        && ((expr.starts_with('\'') && expr.ends_with('\''))
            || (expr.starts_with('"') && expr.ends_with('"'))
            || (expr.starts_with('`') && expr.ends_with('`')))
}

#[inline]
fn is_bool_literal(expr: &str) -> bool {
    matches!(expr, "true" | "false")
}

#[inline]
fn is_number_literal(expr: &str) -> bool {
    !expr.is_empty() && expr.parse::<f64>().is_ok_and(f64::is_finite)
}

fn build_report(
    formatter: &Formatter,
    comp_count: usize,
    diags: &[FileDiag],
    json_flag: bool,
) -> Report {
    if json_flag {
        let payload: Vec<_> = diags
            .iter()
            .map(|diag| json!({ "file": diag.file, "diagnostics": diag.errors }))
            .collect();
        let code = i32::from(!diags.is_empty());
        return Report {
            data: serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "[]".into()),
            code,
            details: None,
        };
    }
    let msg = format!("completed type checking {comp_count} component(s) (0.01 sec)");
    if diags.is_empty() {
        return Report {
            data: formatter.success_summary(&format!(
                "{msg}. found 0 errors. no errors were found.",
            )),
            code: 0,
            details: None,
        };
    }
    let mut lines: Vec<String> = diags
        .iter()
        .flat_map(|diag| {
            diag.errors
                .iter()
                .map(move |err| format!("{}: {err}", diag.file))
        })
        .collect();
    lines.push(format!(
        "{} {msg}. found errors in {} files.",
        formatter.error_symbol(),
        diags.len(),
    ));
    Report { data: lines.join("\n"), code: 1, details: None }
}

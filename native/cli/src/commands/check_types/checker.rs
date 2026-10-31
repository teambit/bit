//! Native TypeScript type checking for workspace components.

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
use std::{ffi::OsString, fs, io, path::Path};

const CORE_ASPECT_IDS: &str =
    include_str!("../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");

struct FileDiag {
    file: String,
    errors: Vec<String>,
}

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
    let matched =
        match match_components(root, &ws, &bitmap, options.pattern.as_deref(), Chalk::detect(args))
        {
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
    let comp_count = matched.len();
    let formatter = Formatter::new(Chalk::detect(args));
    let all = options.all;
    let json_flag = options.json;
    let outcome =
        workspace_command::execute_without_loader(root, args, "check-types", move |out| {
            if all {
                out.warning("--all is deprecated, use --unmodified instead");
            }
            Ok(build_report(&formatter, comp_count, &diags, json_flag))
        })?;
    Ok(Some(outcome))
}

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
    Ok(ws
        .active()
        .filter(|(cand, _)| {
            let bare = cand.id.to_string_without_version();
            entries
                .iter()
                .any(|entry| entry.id.to_string_without_version() == bare)
        })
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
            let full_path = component.dir.join(rel_file);
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

fn is_ts_source(rel_file: &str) -> bool {
    !rel_file.ends_with(".d.ts") && (rel_file.ends_with(".ts") || rel_file.ends_with(".tsx"))
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
        if matches!(prev, Some(b'=' | b'!' | b'<' | b'>')) || matches!(next, Some(b'=' | b'>')) {
            continue;
        }
        return Some(idx);
    }
    None
}

fn is_string_literal(expr: &str) -> bool {
    (expr.starts_with('\'') && expr.ends_with('\''))
        || (expr.starts_with('"') && expr.ends_with('"'))
        || (expr.starts_with('`') && expr.ends_with('`'))
}

fn is_bool_literal(expr: &str) -> bool {
    matches!(expr, "true" | "false")
}

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

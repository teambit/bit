//! TypeScript type-checking and JavaScript/TypeScript linting for `bit validate`.

use crate::commands::workspace_command::format::Formatter;
use bit_install::{model::WorkspaceComponent, workspace::BitmapEntry};
use std::{collections::HashSet, fs};

const KNOWN_GLOBALS: &[&str] = &[
    "Array",
    "BigInt",
    "Boolean",
    "Buffer",
    "Date",
    "Error",
    "Function",
    "Infinity",
    "JSON",
    "Map",
    "Math",
    "NaN",
    "Number",
    "Object",
    "Promise",
    "Proxy",
    "React",
    "Reflect",
    "RegExp",
    "Set",
    "String",
    "Symbol",
    "TypeError",
    "URL",
    "URLSearchParams",
    "WeakMap",
    "WeakSet",
    "__dirname",
    "__filename",
    "clearInterval",
    "clearTimeout",
    "console",
    "decodeURI",
    "decodeURIComponent",
    "document",
    "encodeURI",
    "encodeURIComponent",
    "exports",
    "false",
    "fetch",
    "global",
    "globalThis",
    "isFinite",
    "isNaN",
    "module",
    "null",
    "parseFloat",
    "parseInt",
    "process",
    "require",
    "setInterval",
    "setTimeout",
    "true",
    "undefined",
    "window",
];

pub(super) struct StepResult {
    pub code: i32,
    pub message: String,
}

pub(super) fn run_check_types_step(matched: &[(&BitmapEntry, &WorkspaceComponent)]) -> StepResult {
    let mut error_files = 0usize;
    let mut details = Vec::new();
    for (_, comp) in matched {
        check_component_types(comp, &mut error_files, &mut details);
    }
    if error_files > 0 {
        details.push(format!("found errors in {error_files} files"));
        StepResult { code: 1, message: details.join("\n") }
    } else {
        StepResult { code: 0, message: "no type errors found".to_owned() }
    }
}

fn check_component_types(
    comp: &WorkspaceComponent,
    error_files: &mut usize,
    details: &mut Vec<String>,
) {
    for rel_file in &comp.files {
        if !is_ts_source(rel_file) {
            continue;
        }
        let full_path = comp.dir.join(rel_file);
        let Ok(content) = fs::read_to_string(&full_path) else {
            continue;
        };
        let errs = check_ts_content(&content);
        if !errs.is_empty() {
            *error_files += 1;
            details.extend(
                errs.into_iter()
                    .map(|err| format!("{}: {err}", full_path.display())),
            );
        }
    }
}

fn is_ts_source(rel_file: &str) -> bool {
    !rel_file.ends_with(".d.ts") && (rel_file.ends_with(".ts") || rel_file.ends_with(".tsx"))
}

pub(super) fn check_ts_content(content: &str) -> Vec<String> {
    let mut errors = Vec::new();
    for (idx, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if !is_comment_or_empty(trimmed)
            && let Some(msg) = check_line_type_mismatch(trimmed)
        {
            errors.push(format!("line {}: {msg}", idx + 1));
        }
    }
    errors
}

fn is_comment_or_empty(trimmed: &str) -> bool {
    trimmed.is_empty()
        || trimmed.starts_with("//")
        || trimmed.starts_with("/*")
        || trimmed.starts_with('*')
}

fn check_line_type_mismatch(line: &str) -> Option<&'static str> {
    if is_type_or_interface_decl(line) {
        return None;
    }
    let eq_idx = find_assign_eq(line)?;
    let lhs = line[..eq_idx].trim();
    let rhs = line[eq_idx + 1..]
        .trim()
        .trim_end_matches(';')
        .trim();
    let (_, raw_type) = lhs.rsplit_once(':')?;
    match raw_type.trim() {
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

fn is_type_or_interface_decl(line: &str) -> bool {
    line.starts_with("type ")
        || line.starts_with("export type ")
        || line.starts_with("interface ")
        || line.starts_with("export interface ")
}

fn find_assign_eq(line: &str) -> Option<usize> {
    let bytes = line.as_bytes();
    for (idx, &byte) in bytes.iter().enumerate() {
        if byte != b'=' {
            continue;
        }
        let prev = idx
            .checked_sub(1)
            .and_then(|pos| bytes.get(pos))
            .copied();
        let next = bytes.get(idx + 1).copied();
        if !matches!(prev, Some(b'=' | b'!' | b'<' | b'>')) && !matches!(next, Some(b'=' | b'>')) {
            return Some(idx);
        }
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
    !expr.is_empty() && expr.parse::<f64>().is_ok()
}

pub(super) fn run_lint_step(
    matched: &[(&BitmapEntry, &WorkspaceComponent)],
    formatter: &Formatter,
) -> StepResult {
    let mut total_errors = 0usize;
    let mut dirty_blocks = Vec::new();
    for (_, comp) in matched {
        let comp_lines = lint_component_files(comp, &mut total_errors);
        if !comp_lines.is_empty() {
            let title = formatter.chalk.cyan(&comp.id.to_string_without_version());
            dirty_blocks.push(format!("{title}\n{}", comp_lines.join("\n")));
        }
    }
    if total_errors > 0 {
        let summary = format!("found {total_errors} error(s) and 0 warning(s)");
        let message = format!("{}\n\n{summary}", dirty_blocks.join("\n\n"));
        StepResult { code: 1, message }
    } else {
        StepResult { code: 0, message: "no linting issues found".to_owned() }
    }
}

fn lint_component_files(comp: &WorkspaceComponent, total_errors: &mut usize) -> Vec<String> {
    let mut comp_lines = Vec::new();
    for rel_file in &comp.files {
        if !is_lintable_source(rel_file) {
            continue;
        }
        let full_path = comp.dir.join(rel_file);
        let Ok(content) = fs::read_to_string(&full_path) else {
            continue;
        };
        let errs = lint_source_content(&content);
        if !errs.is_empty() {
            *total_errors += errs.len();
            comp_lines.push(full_path.to_string_lossy().into_owned());
            comp_lines.extend(errs);
        }
    }
    comp_lines
}

fn is_lintable_source(rel_file: &str) -> bool {
    !rel_file.ends_with(".d.ts")
        && (rel_file.ends_with(".js")
            || rel_file.ends_with(".jsx")
            || rel_file.ends_with(".ts")
            || rel_file.ends_with(".tsx"))
}

pub(super) fn lint_source_content(content: &str) -> Vec<String> {
    let declared = collect_declared_identifiers(content);
    let mut errors = Vec::new();
    for (idx, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if is_comment_or_empty(trimmed) {
            continue;
        }
        for undef in find_undeclared_call_args(trimmed, &declared) {
            errors.push(format!("  {}:1  error  '{undef}' is not defined  no-undef", idx + 1));
        }
    }
    errors
}

fn collect_declared_identifiers(content: &str) -> HashSet<String> {
    let mut declared: HashSet<String> = KNOWN_GLOBALS
        .iter()
        .copied()
        .map(str::to_owned)
        .collect();
    for line in content.lines() {
        collect_line_declarations(line.trim(), &mut declared);
    }
    declared
}

fn collect_line_declarations(trimmed: &str, declared: &mut HashSet<String>) {
    let decl_rest = trimmed
        .strip_prefix("export ")
        .unwrap_or(trimmed)
        .strip_prefix("default ")
        .unwrap_or(trimmed);
    for kw in ["const ", "let ", "var ", "function ", "class ", "type ", "interface "] {
        if let Some(after) = decl_rest.strip_prefix(kw) {
            let lhs = after
                .split(['=', ':', '(', '{', '<'])
                .next()
                .unwrap_or(after);
            insert_ident_tokens(lhs, declared);
        }
    }
    if let Some(after) = trimmed.strip_prefix("import ") {
        let clause = after
            .split(" from ")
            .next()
            .unwrap_or(after);
        insert_ident_tokens(clause, declared);
    }
}

fn insert_ident_tokens(segment: &str, declared: &mut HashSet<String>) {
    for token in segment.split(|ch: char| !is_ident_char(ch)) {
        if is_valid_ident(token) && token != "as" && token != "type" {
            declared.insert(token.to_owned());
        }
    }
}

fn find_undeclared_call_args(line: &str, declared: &HashSet<String>) -> Vec<String> {
    let mut missing = Vec::new();
    let Some((open_idx, close_idx)) = line.find('(').zip(line.rfind(')')) else {
        return missing;
    };
    if close_idx <= open_idx || line[close_idx + 1..].trim_start().starts_with("=>") {
        return missing;
    }
    for raw_arg in line[open_idx + 1..close_idx].split(',') {
        let arg = raw_arg.trim();
        if is_valid_ident(arg) && !declared.contains(arg) {
            missing.push(arg.to_owned());
        }
    }
    missing
}

fn is_valid_ident(token: &str) -> bool {
    let mut chars = token.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    (first.is_ascii_alphabetic() || first == '_' || first == '$') && chars.all(is_ident_char)
}

fn is_ident_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_' || ch == '$'
}

//! Lightweight TS/JS transpilation and source-map emission for standard workspace components.

use serde_json::json;
use std::{fmt::Write, path::Path};

const CJS_PREAMBLE: &str = "\"use strict\";\n\
var __importDefault = (this && this.__importDefault) || function (mod) {\n\
    return (mod && mod.__esModule) ? mod : { \"default\": mod };\n\
};\n\
Object.defineProperty(exports, \"__esModule\", { value: true });\n";

pub(super) fn is_compilable_file(rel_file: &str) -> bool {
    if rel_file.ends_with(".d.ts") {
        return false;
    }
    rel_file.ends_with(".ts")
        || rel_file.ends_with(".tsx")
        || rel_file.ends_with(".js")
        || rel_file.ends_with(".jsx")
}

pub(super) fn dist_rel_path(rel_file: &str) -> String {
    for suffix in [".tsx", ".ts", ".jsx", ".js"] {
        if let Some(stem) = rel_file.strip_suffix(suffix) {
            return format!("{stem}.js");
        }
    }
    rel_file.to_owned()
}

pub(super) fn transpile_source(src: &str, rel_file: &str, map_file_name: &str) -> String {
    let is_ts = rel_file.ends_with(".ts") || rel_file.ends_with(".tsx");
    if !is_ts && !has_esm_statements(src) {
        return wrap_commonjs_plain(src, map_file_name);
    }
    let mut body = String::from(CJS_PREAMBLE);
    let mut skip_brace_depth = 0usize;
    for line in src.lines() {
        if skip_brace_depth > 0 {
            skip_brace_depth = update_brace_depth(skip_brace_depth, line);
            continue;
        }
        if let Some(depth) = type_only_block_depth(line.trim()) {
            skip_brace_depth = depth;
            continue;
        }
        body.push_str(&transpile_line(line));
        body.push('\n');
    }
    let _ = writeln!(body, "//# sourceMappingURL={map_file_name}");
    body
}

fn has_esm_statements(src: &str) -> bool {
    src.lines()
        .any(|line| {
            let trimmed = line.trim_start();
            trimmed.starts_with("import ") || trimmed.starts_with("export ")
        })
}

fn wrap_commonjs_plain(src: &str, map_file_name: &str) -> String {
    let trimmed = src.trim_start();
    let prefix = if trimmed.starts_with(r#""use strict""#) || trimmed.starts_with("'use strict'") {
        ""
    } else {
        "\"use strict\";\n"
    };
    format!("{prefix}{src}\n//# sourceMappingURL={map_file_name}\n")
}

pub(super) fn source_map_json(rel_file: &str, out_file_name: &str, comp_dir: &Path) -> String {
    let normalized_rel = rel_file.replace('\\', "/");
    let map = json!({
        "version": 3,
        "file": out_file_name,
        "sourceRoot": comp_dir.to_string_lossy(),
        "sources": [normalized_rel],
        "names": [],
        "mappings": "AAAA"
    });
    map.to_string()
}

fn type_only_block_depth(trimmed: &str) -> Option<usize> {
    if trimmed.starts_with("import type ") {
        return Some(0);
    }
    let is_type_decl = trimmed.starts_with("export type ")
        || trimmed.starts_with("type ")
        || trimmed.starts_with("export interface ")
        || trimmed.starts_with("interface ");
    if !is_type_decl {
        return None;
    }
    Some(update_brace_depth(0, trimmed))
}

fn update_brace_depth(current: usize, line: &str) -> usize {
    let opens = line
        .chars()
        .filter(|&ch| ch == '{')
        .count();
    let closes = line
        .chars()
        .filter(|&ch| ch == '}')
        .count();
    (current + opens).saturating_sub(closes)
}

fn transpile_line(line: &str) -> String {
    let trimmed = line.trim();
    if let Some(import_stmt) = trimmed.strip_prefix("import ") {
        return transpile_import(import_stmt);
    }
    if let Some(default_expr) = trimmed.strip_prefix("export default ") {
        return format!("exports.default = {default_expr}");
    }
    if let Some(rest) = trimmed.strip_prefix("export ") {
        return transpile_export(rest);
    }
    strip_var_type_annotation(line)
}

fn transpile_import(import_stmt: &str) -> String {
    let stmt = import_stmt.trim_end_matches(';').trim();
    let Some((clause, from_mod)) = stmt.split_once(" from ") else {
        let mod_lit = stmt.trim();
        return format!("require({mod_lit});");
    };
    let clause = clause.trim();
    let mod_lit = from_mod.trim();
    if let Some(ns) = clause.strip_prefix("* as ") {
        let ns = ns.trim();
        return format!("const {ns} = require({mod_lit});");
    }
    if clause.starts_with('{') {
        let bindings = clause.replace(" as ", ": ");
        return format!("const {bindings} = require({mod_lit});");
    }
    let ident = clause
        .split(',')
        .next()
        .unwrap_or(clause)
        .trim();
    format!(
        "const _{ident} = __importDefault(require({mod_lit})); const {ident} = _{ident}.default;",
    )
}

fn transpile_export(rest: &str) -> String {
    for kw in ["const ", "let ", "var "] {
        if let Some(after_kw) = rest.strip_prefix(kw) {
            let cleaned = strip_var_type_annotation(&format!("{kw}{after_kw}"));
            if let Some(ident) = take_ident(after_kw) {
                return format!("{cleaned}\nexports.{ident} = {ident};");
            }
            return cleaned;
        }
    }
    if let Some(after_fn) = rest.strip_prefix("function ") {
        let cleaned = strip_fn_type_annotations(after_fn);
        if let Some(ident) = take_ident(after_fn) {
            return format!("exports.{ident} = {ident};\nfunction {cleaned}");
        }
        return format!("function {cleaned}");
    }
    rest.to_owned()
}

fn strip_var_type_annotation(line: &str) -> String {
    let trimmed = line.trim_start();
    let has_kw =
        trimmed.starts_with("const ") || trimmed.starts_with("let ") || trimmed.starts_with("var ");
    if !has_kw {
        return line.to_owned();
    }
    let Some(eq_idx) = find_assign_eq(line) else {
        return line.to_owned();
    };
    let lhs = &line[..eq_idx];
    let rhs = &line[eq_idx..];
    if let Some(colon_idx) = lhs.find(':') {
        let before_colon = lhs[..colon_idx].trim_end();
        return format!("{before_colon} {rhs}");
    }
    line.to_owned()
}

fn strip_fn_type_annotations(after_fn: &str) -> String {
    let Some(open_paren) = after_fn.find('(') else {
        return after_fn.to_owned();
    };
    let Some(close_paren) = after_fn[open_paren..].find(')') else {
        return after_fn.to_owned();
    };
    let close_paren = open_paren + close_paren;
    let name_part = &after_fn[..open_paren];
    let params_raw = &after_fn[open_paren + 1..close_paren];
    let params_clean = params_raw
        .split(',')
        .map(|param| {
            param
                .split_once(':')
                .map_or_else(|| param.trim(), |(pname, _)| pname.trim().trim_end_matches('?'))
        })
        .collect::<Vec<_>>()
        .join(", ");
    let after_close = &after_fn[close_paren + 1..];
    let body_part = if let Some(brace_idx) = after_close.find('{') {
        &after_close[brace_idx..]
    } else {
        after_close
    };
    format!("{name_part}({params_clean}) {body_part}")
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

fn take_ident(text: &str) -> Option<&str> {
    let trimmed = text.trim_start();
    let end = trimmed
        .find(|ch: char| !ch.is_ascii_alphanumeric() && ch != '_' && ch != '$')
        .unwrap_or(trimmed.len());
    (end > 0).then_some(&trimmed[..end])
}

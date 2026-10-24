//! Source-file parser and function evaluator for `env.scripts()` (`Scripts.from(...)`).

use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::commands) enum ScriptHandler {
    Shell(String),
    Function(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::commands) struct ParsedScript {
    pub name: String,
    pub handler: ScriptHandler,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(in crate::commands) struct EnvScripts {
    pub has_scripts_method: bool,
    pub scripts: Vec<ParsedScript>,
}

pub(in crate::commands) fn parse_env_scripts_in_dir(dir: &Path) -> EnvScripts {
    let mut files = collect_source_files(dir);
    files.sort_by_key(|path| file_sort_key(path));
    for path in files {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let parsed = parse_scripts_from_source(&content);
        if parsed.has_scripts_method || !parsed.scripts.is_empty() {
            return parsed;
        }
    }
    EnvScripts::default()
}

fn file_sort_key(path: &Path) -> (u8, String) {
    let name = path
        .file_name()
        .and_then(|val| val.to_str())
        .unwrap_or_default();
    let priority = if name.contains(".bit-env.") {
        0
    } else if name.contains(".main.runtime.") {
        1
    } else {
        2
    };
    (priority, name.to_owned())
}

fn collect_source_files(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if path.is_dir() {
            out.extend(collect_subdir_files(&path));
        } else if is_script_source_file(&path) {
            out.push(path);
        }
    }
    out
}

fn collect_subdir_files(path: &Path) -> Vec<PathBuf> {
    let dir_name = path
        .file_name()
        .and_then(|val| val.to_str())
        .unwrap_or_default();
    if matches!(dir_name, "node_modules" | "dist" | ".git") {
        return Vec::new();
    }
    collect_source_files(path)
}

fn is_script_source_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| matches!(ext, "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs"))
}

pub(in crate::commands) fn parse_scripts_from_source(source: &str) -> EnvScripts {
    let Some(obj_inner) = find_scripts_object_body(source) else {
        return EnvScripts::default();
    };
    let scripts = split_top_level_entries(obj_inner)
        .into_iter()
        .filter_map(parse_single_entry)
        .collect();
    EnvScripts { has_scripts_method: true, scripts }
}

fn find_scripts_object_body(source: &str) -> Option<&str> {
    for marker in ["Scripts.from(", "new Scripts("] {
        if let Some(pos) = source.find(marker) {
            let after = &source[pos + marker.len()..];
            let open_offset = after.find('{')?;
            return extract_braced_inner(&after[open_offset..]);
        }
    }
    let method_pos = source.find("scripts(")?;
    let method_rest = &source[method_pos..];
    let method_open = method_rest.find('{')?;
    let method_body = extract_braced_inner(&method_rest[method_open..])?;
    let ret_pos = method_body.find("return")?;
    let after_ret = &method_body[ret_pos + "return".len()..];
    let obj_open = after_ret.find('{')?;
    extract_braced_inner(&after_ret[obj_open..])
}

fn extract_braced_inner(text: &str) -> Option<&str> {
    let bytes = text.as_bytes();
    if bytes.first().copied() != Some(b'{') {
        return None;
    }
    let mut depth = 0usize;
    let mut idx = 0usize;
    while idx < bytes.len() {
        if let Some(next_idx) = skip_token(bytes, idx) {
            idx = next_idx;
            continue;
        }
        if bytes[idx] == b'{' {
            depth += 1;
        } else if bytes[idx] == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some(&text[1..idx]);
            }
        }
        idx += 1;
    }
    None
}

fn skip_token(bytes: &[u8], idx: usize) -> Option<usize> {
    match bytes[idx] {
        b'\'' | b'"' | b'`' => Some(skip_quoted(bytes, idx)),
        b'/' if bytes.get(idx + 1) == Some(&b'/') => Some(skip_line_comment(bytes, idx + 2)),
        b'/' if bytes.get(idx + 1) == Some(&b'*') => Some(skip_block_comment(bytes, idx + 2)),
        _ => None,
    }
}

fn skip_quoted(bytes: &[u8], start: usize) -> usize {
    let quote = bytes[start];
    let mut idx = start + 1;
    while idx < bytes.len() {
        if bytes[idx] == b'\\' {
            idx += 2;
        } else if bytes[idx] == quote {
            return idx + 1;
        } else {
            idx += 1;
        }
    }
    bytes.len()
}

fn skip_line_comment(bytes: &[u8], mut idx: usize) -> usize {
    while idx < bytes.len() && bytes[idx] != b'\n' {
        idx += 1;
    }
    idx
}

fn skip_block_comment(bytes: &[u8], mut idx: usize) -> usize {
    while idx + 1 < bytes.len() {
        if bytes[idx] == b'*' && bytes[idx + 1] == b'/' {
            return idx + 2;
        }
        idx += 1;
    }
    bytes.len()
}

fn split_top_level_entries(inner: &str) -> Vec<&str> {
    let bytes = inner.as_bytes();
    let mut entries = Vec::new();
    let mut start = 0usize;
    let mut depth = 0usize;
    let mut idx = 0usize;
    while idx < bytes.len() {
        if let Some(next_idx) = skip_token(bytes, idx) {
            idx = next_idx;
            continue;
        }
        match bytes[idx] {
            b'{' | b'(' | b'[' => depth += 1,
            b'}' | b')' | b']' => depth = depth.saturating_sub(1),
            b',' if depth == 0 => {
                push_non_empty(&mut entries, &inner[start..idx]);
                start = idx + 1;
            }
            _ => {}
        }
        idx += 1;
    }
    push_non_empty(&mut entries, &inner[start..]);
    entries
}

fn push_non_empty<'a>(entries: &mut Vec<&'a str>, slice: &'a str) {
    let trimmed = slice.trim();
    if !trimmed.is_empty() {
        entries.push(trimmed);
    }
}

fn parse_single_entry(raw_entry: &str) -> Option<ParsedScript> {
    let cleaned = strip_leading_comments(raw_entry).trim();
    let colon_idx = find_top_level_colon(cleaned)?;
    let raw_key = cleaned[..colon_idx].trim();
    let raw_val = cleaned[colon_idx + 1..].trim();
    let name = unquote_string(raw_key).unwrap_or_else(|| raw_key.to_owned());
    if name.is_empty() {
        return None;
    }
    let handler = match unquote_string(raw_val) {
        Some(cmd) => ScriptHandler::Shell(cmd),
        None => ScriptHandler::Function(raw_val.to_owned()),
    };
    Some(ParsedScript { name, handler })
}

fn strip_leading_comments(mut text: &str) -> &str {
    loop {
        text = text.trim_start();
        if let Some(rest) = text.strip_prefix("//") {
            text = rest
                .find('\n')
                .map_or("", |pos| &rest[pos + 1..]);
        } else if let Some(rest) = text.strip_prefix("/*") {
            text = rest
                .find("*/")
                .map_or("", |pos| &rest[pos + 2..]);
        } else {
            return text;
        }
    }
}

fn find_top_level_colon(text: &str) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut idx = 0usize;
    while idx < bytes.len() {
        if let Some(next_idx) = skip_token(bytes, idx) {
            idx = next_idx;
        } else if bytes[idx] == b':' {
            return Some(idx);
        } else {
            idx += 1;
        }
    }
    None
}

fn unquote_string(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let first = *trimmed.as_bytes().first()?;
    if trimmed.len() < 2 || !matches!(first, b'\'' | b'"' | b'`') {
        return None;
    }
    (skip_quoted(trimmed.as_bytes(), 0) == trimmed.len()).then(|| {
        trimmed[1..trimmed.len() - 1].to_owned()
    })
}

pub(in crate::commands) fn eval_function_logs(body: &str, component_count: usize) -> Vec<String> {
    let mut logs = Vec::new();
    let mut rest = body;
    let marker = "console.log(";
    while let Some(pos) = rest.find(marker) {
        let after = &rest[pos + marker.len()..];
        let Some(close_pos) = find_closing_paren(after) else {
            break;
        };
        if let Some(rendered) = render_log_arg(after[..close_pos].trim(), component_count) {
            logs.push(rendered);
        }
        rest = &after[close_pos + 1..];
    }
    logs
}

fn find_closing_paren(text: &str) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut depth = 1usize;
    let mut idx = 0usize;
    while idx < bytes.len() {
        if let Some(next_idx) = skip_token(bytes, idx) {
            idx = next_idx;
            continue;
        }
        if bytes[idx] == b'(' {
            depth += 1;
        } else if bytes[idx] == b')' {
            depth -= 1;
            if depth == 0 {
                return Some(idx);
            }
        }
        idx += 1;
    }
    None
}

fn render_log_arg(arg: &str, component_count: usize) -> Option<String> {
    let inner = unquote_string(arg)?;
    let mut out = String::new();
    let mut rest = inner.as_str();
    while let Some(start) = rest.find("${") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let Some(end) = after.find('}') else {
            out.push_str(&rest[start..]);
            return Some(out);
        };
        out.push_str(&eval_template_expr(after[..end].trim(), component_count));
        rest = &after[end + 1..];
    }
    out.push_str(rest);
    Some(out)
}

fn eval_template_expr(expr: &str, component_count: usize) -> String {
    if expr.contains("components") && expr.contains("length") {
        component_count.to_string()
    } else {
        expr.to_owned()
    }
}

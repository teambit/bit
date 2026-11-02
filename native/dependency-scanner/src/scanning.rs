//! Per-file source parsing and AST dependency extraction.
//!
//! [`scan`] parses `JavaScript` and `TypeScript` [`File`] sources with Oxc [`Parser`] into [`Outcome`].

use crate::{
    File, Outcome, Scanner, classification::classification_outcome, limits, line, line_starts,
    outcome,
};
use indexmap::IndexMap;
use oxc_allocator::Allocator;
use oxc_ast::ast::Program;
use oxc_ast_visit::Visit;
use oxc_parser::{ParseOptions, Parser};
use oxc_span::SourceType;
use std::io;

/// Parse and scan a single source [`File`] for module dependencies and exports.
pub(crate) fn scan(file: &File, unsupported_options: bool) -> Outcome {
    if unsupported_options
        || file.source
            .as_ref()
            .is_some_and(|source| source.len() > limits::SOURCE_BYTES)
    {
        return outcome(
            file,
            "unsupported",
            "options or source size require legacy fallback".into(),
        );
    }
    let kind = normalized_kind(file);
    let ts = matches!(kind.as_str(), "ts" | "tsx" | "mts" | "cts");
    let Some(source_type) = source_type(&kind) else {
        return outcome(file, "unsupported", "unsupported file kind".into());
    };
    let source = match limits::source(file.source.as_deref(), std::path::Path::new(&file.path)) {
        Ok(source) => source,
        Err(error)
            if matches!(error.kind(), io::ErrorKind::FileTooLarge | io::ErrorKind::InvalidData) =>
        {
            return outcome(file, "unsupported", error.to_string());
        }
        Err(error) => return outcome(file, "read_error", error.to_string()),
    };
    let header = source.strip_prefix('\u{feff}').unwrap_or(&source);
    if header.starts_with("// @bit-no-check") || header.starts_with("/* @bit-no-check") {
        return Outcome {
            path: file.path.clone(),
            status: "ok",
            dependencies: IndexMap::new(),
            diagnostics: vec![],
        };
    }
    parse_source(file, &source, source_type, ts)
}
/// Parses `source` with Oxc [`Parser`] and extracts dependencies into an [`Outcome`].
fn parse_source(file: &File, source: &str, source_type: SourceType, ts: bool) -> Outcome {
    let allocator = Allocator::default();
    // Babel and TypeScript ESTree drop parentheses, so `(require)('x')` is a plain require call.
    let options = ParseOptions { preserve_parens: false, ..ParseOptions::default() };
    let parsed = Parser::new(&allocator, source, source_type).with_options(options).parse();
    if !parsed.diagnostics.is_empty() || parsed.fatal_error {
        return Outcome {
            path: file.path.clone(),
            // Babel also accepts Flow and proposal plugins Oxc rejects, so JS defers to legacy parsing.
            status: if ts { "parse_error" } else { "unsupported" },
            dependencies: IndexMap::new(),
            diagnostics: parsed.diagnostics
                .iter()
                .map(ToString::to_string)
                .collect(),
        };
    }
    extract_source(file, source, ts, &parsed.program)
}
/// Classifies `program` and runs [`Scanner`] to extract dependencies into an [`Outcome`].
fn extract_source(file: &File, source: &str, ts: bool, program: &Program<'_>) -> Outcome {
    if !ts && let Some(result) = classification_outcome(file, program) {
        return result;
    }
    let mut scanner = scanner_for_source(source, ts, &program.comments);
    scanner.visit_program(program);
    // Legacy results are JS objects, which enumerate integer-like keys before all others.
    if scanner.unsupported || scanner.deps.keys().any(|name| is_array_index(name)) {
        return outcome(
            file,
            "unsupported",
            "decorators, import attributes/phases, namespace reexports, coerced, prototype-key or integer-like specifiers require legacy fallback"
                .into(),
        );
    }
    Outcome {
        path: file.path.clone(),
        status: "ok",
        dependencies: scanner.deps,
        diagnostics: vec![],
    }
}
/// Returns `true` when `name` is an ECMAScript array index (`0` or a canonical `u32` below `u32::MAX`).
#[inline]
fn is_array_index(name: &str) -> bool {
    (name == "0" || (!name.starts_with('0') && name.bytes().all(|byte| byte.is_ascii_digit())))
        && name
            .parse::<u32>()
            .is_ok_and(|index| index != u32::MAX)
}
fn scanner_for_source(
    source: &str,
    ts: bool,
    source_comments: &[oxc_ast::ast::Comment],
) -> Scanner {
    let comment_has = |needle: &str| {
        source_comments
            .iter()
            .any(|comment| {
                comment
                    .content_span()
                    .source_text(source)
                    .contains(needle)
            })
    };
    let no_check = ts && comment_has("@bit-no-check");
    let has_ignore = ts && !no_check && comment_has("@bit-ignore");
    let line_starts = if has_ignore { line_starts(source) } else { vec![] };
    let comments = if has_ignore {
        source_comments
            .iter()
            .map(|comment| {
                (
                    line(&line_starts, comment.span.start),
                    comment
                        .content_span()
                        .source_text(source)
                        .to_owned(),
                )
            })
            .collect()
    } else {
        vec![]
    };
    Scanner { line_starts, ts, no_check, comments, deps: IndexMap::new(), unsupported: false }
}
#[inline]
fn normalized_kind(file: &File) -> String {
    file.kind
        .as_deref()
        .map(str::trim)
        .filter(|kind| !kind.is_empty())
        .or_else(|| {
            let file_name = file.path
                .trim()
                .trim_end_matches(['/', '\\'])
                .rsplit(['/', '\\'])
                .next()
                .unwrap_or_default();
            std::path::Path::new(file_name).extension().and_then(std::ffi::OsStr::to_str)
        })
        .unwrap_or("")
        .trim_start_matches('.')
        .to_ascii_lowercase()
}
#[inline]
fn source_type(kind: &str) -> Option<SourceType> {
    match kind {
        "js" | "mjs" | "cjs" | "jsx" => Some(SourceType::mjs().with_jsx(true)),
        "ts" | "mts" | "cts" => Some(SourceType::ts()),
        "tsx" => Some(SourceType::tsx()),
        _ => None,
    }
}

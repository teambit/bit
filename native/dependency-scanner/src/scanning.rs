use crate::{
    File, Outcome, Scanner,
    classification::classification_outcome,
    limits, line, line_starts, outcome,
    timings::{Metrics, Stage, measure},
};
use indexmap::IndexMap;
use oxc_allocator::Allocator;
use oxc_ast::ast::Program;
use oxc_ast_visit::Visit;
use oxc_parser::{ParseOptions, Parser};
use oxc_span::SourceType;
use std::io;

pub(crate) fn scan_with_metrics(
    file: &File,
    unsupported_options: bool,
    metrics: Option<&Metrics>,
) -> Outcome {
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
    let kind = file.kind
        .as_deref()
        .or_else(|| file.path.rsplit('.').next())
        .unwrap_or("");
    let ts = matches!(kind, "ts" | "tsx" | "mts" | "cts");
    let Some(source_type) = source_type(kind) else {
        return outcome(file, "unsupported", "unsupported file kind".into());
    };
    let source = match measure(metrics, Stage::SourceRead, || {
        limits::source(file.source.as_deref(), std::path::Path::new(&file.path))
    }) {
        Ok(source) => source,
        Err(error)
            if matches!(error.kind(), io::ErrorKind::FileTooLarge | io::ErrorKind::InvalidData) =>
        {
            return outcome(file, "unsupported", error.to_string());
        }
        Err(error) => return outcome(file, "read_error", error.to_string()),
    };
    if source.starts_with("// @bit-no-check") || source.starts_with("/* @bit-no-check") {
        return Outcome {
            path: file.path.clone(),
            status: "ok",
            dependencies: IndexMap::new(),
            diagnostics: vec![],
        };
    }
    parse_source(file, &source, source_type, ts, metrics)
}
fn parse_source(
    file: &File,
    source: &str,
    source_type: SourceType,
    ts: bool,
    metrics: Option<&Metrics>,
) -> Outcome {
    let allocator = Allocator::default();
    // Babel and TypeScript ESTree drop parentheses, so `(require)('x')` is a plain require call.
    let options = ParseOptions { preserve_parens: false, ..ParseOptions::default() };
    let parsed = measure(metrics, Stage::Parse, || {
        Parser::new(&allocator, source, source_type).with_options(options).parse()
    });
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
    measure(metrics, Stage::Extract, || extract_source(file, source, ts, &parsed.program))
}
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
    let line_starts = if ts { line_starts(source) } else { vec![] };
    let comments: Vec<_> = source_comments
        .iter()
        .filter(|_| ts)
        .map(|comment| {
            (
                line(&line_starts, comment.span.start),
                comment
                    .content_span()
                    .source_text(source)
                    .to_owned(),
            )
        })
        .collect();
    Scanner {
        line_starts,
        ts,
        no_check: comments
            .iter()
            .any(|(_, c)| c.contains("@bit-no-check")),
        comments,
        deps: IndexMap::new(),
        unsupported: false,
    }
}
fn source_type(kind: &str) -> Option<SourceType> {
    match kind {
        "js" | "mjs" | "cjs" | "jsx" => Some(SourceType::mjs().with_jsx(true)),
        "ts" | "mts" | "cts" => Some(SourceType::ts()),
        "tsx" => Some(SourceType::tsx()),
        _ => None,
    }
}

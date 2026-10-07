#![cfg_attr(dylint_lib = "perfectionist", feature(register_tool))]
#![cfg_attr(dylint_lib = "perfectionist", register_tool(perfectionist))]
mod classification;

use crate::classification::classification_outcome;
use indexmap::IndexMap;
use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Argument, CallExpression, Decorator, ExportAllDeclaration, ExportDefaultDeclaration,
    ExportDefaultDeclarationKind, ExportFromDeclaration, ExportNamedDeclaration, Expression,
    ImportDeclaration, ImportDeclarationSpecifier, ImportExpression, ImportOrExportKind,
    TSExternalModuleReference,
};
use oxc_ast_visit::{Visit, walk};
use oxc_parser::Parser;
use oxc_span::{SourceType, Span};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    io::{self, BufRead, Write},
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    version: u32,
    #[serde(default)]
    id: Value,
    files: Vec<File>,
    #[serde(default)]
    options: BTreeMap<String, Value>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct File {
    path: String,
    source: Option<String>,
    kind: Option<String>,
}
#[derive(Serialize)]
struct Response {
    version: u32,
    id: Value,
    files: Vec<Outcome>,
}
#[derive(Serialize)]
struct Outcome {
    path: String,
    status: &'static str,
    dependencies: IndexMap<String, Dependency>,
    diagnostics: Vec<String>,
}
#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Dependency {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    import_specifiers: Vec<Specifier>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_type_import: Option<bool>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Specifier {
    is_default: bool,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    exported: Option<bool>,
}
struct Scanner {
    line_starts: Vec<u32>,
    ts: bool,
    no_check: bool,
    comments: Vec<(usize, String)>,
    deps: IndexMap<String, Dependency>,
    unsupported: bool,
}
fn line_starts(source: &str) -> Vec<u32> {
    std::iter::once(0)
        .chain(
            source
                .bytes()
                .enumerate()
                .filter(|(_, byte)| *byte == b'\n')
                .map(|(index, _)| u32::try_from(index + 1).unwrap_or(u32::MAX)),
        )
        .collect()
}
/// One-based line number of a byte offset.
fn line(line_starts: &[u32], offset: u32) -> usize {
    line_starts.partition_point(|start| *start <= offset)
}
impl Scanner {
    fn ignored(&self, span: Span) -> bool {
        if self.no_check {
            return true;
        }
        let node_line = line(&self.line_starts, span.start);
        self.comments
            .iter()
            .find(|(l, _)| *l + 1 == node_line)
            .is_some_and(|(_, c)| c.contains("@bit-ignore"))
    }
    fn add(&mut self, name: &str, span: Span) -> Option<&mut Dependency> {
        if name.is_empty() || (self.ts && self.ignored(span)) {
            return None;
        }
        Some(self.deps.entry(name.to_owned()).or_default())
    }
    fn exported(&mut self, name: &str) {
        for dep in self.deps.values_mut() {
            if let Some(spec) = dep.import_specifiers
                .iter_mut()
                .find(|specifier| specifier.name == name)
            {
                spec.exported = Some(true);
            }
        }
    }
}
fn string(expr: &Expression<'_>) -> Option<String> {
    match expr {
        Expression::StringLiteral(s) => Some(s.value.to_string()),
        Expression::TemplateLiteral(t) if t.expressions.is_empty() && t.quasis.len() == 1 => {
            Some(t.quasis[0].value.raw.to_string())
        }
        _ => None,
    }
}
fn argument(arg: &Argument<'_>) -> Option<String> {
    arg.as_expression().and_then(string)
}
fn import_specifier(spec: &ImportDeclarationSpecifier<'_>) -> Specifier {
    let (is_default, name) = match spec {
        ImportDeclarationSpecifier::ImportSpecifier(specifier) => {
            (false, specifier.imported.name().to_string())
        }
        ImportDeclarationSpecifier::ImportDefaultSpecifier(specifier) => {
            (true, specifier.local.name.to_string())
        }
        ImportDeclarationSpecifier::ImportNamespaceSpecifier(specifier) => {
            (false, specifier.local.name.to_string())
        }
    };
    Specifier { is_default, name, exported: None }
}
impl<'a> Visit<'a> for Scanner {
    fn visit_import_declaration(&mut self, node: &ImportDeclaration<'a>) {
        let ts = self.ts;
        if node.phase.is_some() || node.with_clause.is_some() {
            self.unsupported = true;
        }
        if let Some(dep) = self.add(node.source.value.as_str(), node.span) {
            if ts {
                dep.is_type_import = Some(node.import_kind == ImportOrExportKind::Type);
            }
            dep.import_specifiers.extend(
                node.specifiers
                    .iter()
                    .flatten()
                    .map(import_specifier),
            );
        }
        walk::walk_import_declaration(self, node);
    }
    fn visit_export_from_declaration(&mut self, node: &ExportFromDeclaration<'a>) {
        let ts = self.ts;
        if node.with_clause.is_some() {
            self.unsupported = true;
        }
        if let Some(dep) = self.add(node.source.value.as_str(), node.span) {
            if ts {
                dep.is_type_import = Some(node.export_kind == ImportOrExportKind::Type);
            } else {
                for s in &node.specifiers {
                    dep.import_specifiers.push(Specifier {
                        is_default: s.local.name() == "default",
                        name: s.exported.name().to_string(),
                        exported: Some(true),
                    });
                }
            }
        }
        walk::walk_export_from_declaration(self, node);
    }
    fn visit_export_all_declaration(&mut self, node: &ExportAllDeclaration<'a>) {
        let ts = self.ts;
        if node.exported.is_some() || node.with_clause.is_some() {
            self.unsupported = true;
        }
        if let Some(dep) = self.add(node.source.value.as_str(), node.span)
            && ts
        {
            dep.is_type_import = Some(node.export_kind == ImportOrExportKind::Type);
        }
        walk::walk_export_all_declaration(self, node);
    }
    fn visit_export_named_declaration(&mut self, node: &ExportNamedDeclaration<'a>) {
        for s in &node.specifiers {
            self.exported(s.exported.name().as_str());
        }
        walk::walk_export_named_declaration(self, node);
    }
    fn visit_export_default_declaration(&mut self, node: &ExportDefaultDeclaration<'a>) {
        if let ExportDefaultDeclarationKind::Identifier(id) = &node.declaration {
            self.exported(id.name.as_str());
        }
        walk::walk_export_default_declaration(self, node);
    }
    fn visit_import_expression(&mut self, node: &ImportExpression<'a>) {
        if let Expression::StringLiteral(s) = &node.source {
            self.add(s.value.as_str(), node.span);
        }
        walk::walk_import_expression(self, node);
    }
    fn visit_call_expression(&mut self, node: &CallExpression<'a>) {
        if matches!(&node.callee, Expression::Identifier(id) if id.name=="define") {
            self.unsupported = true;
        }
        let accepted = match &node.callee {
            Expression::Identifier(id) => id.name == "require",
            Expression::StaticMemberExpression(m) => {
                m.property.name == "resolve"
                    && match &m.object {
                        Expression::Identifier(id) => id.name == "require",
                        Expression::ImportMeta(_) => true,
                        _ => false,
                    }
            }
            Expression::ComputedMemberExpression(m) => {
                matches!(&m.expression,Expression::Identifier(id) if id.name=="resolve")
                    && matches!(&m.object,Expression::Identifier(id) if id.name=="require")
            }
            _ => false,
        };
        if accepted && let Some(name) = node.arguments.first().and_then(argument) {
            self.add(&name, node.span);
        }
        walk::walk_call_expression(self, node);
    }
    fn visit_ts_external_module_reference(&mut self, node: &TSExternalModuleReference<'a>) {
        self.add(node.expression.value.as_str(), node.span);
        walk::walk_ts_external_module_reference(self, node);
    }
    fn visit_decorator(&mut self, node: &Decorator<'a>) {
        self.unsupported = true;
        walk::walk_decorator(self, node);
    }
}
fn outcome(file: &File, status: &'static str, message: String) -> Outcome {
    Outcome {
        path: file.path.clone(),
        status,
        dependencies: IndexMap::new(),
        diagnostics: vec![message],
    }
}
fn scan(file: &File, unsupported_options: bool) -> Outcome {
    if unsupported_options {
        return outcome(file, "unsupported", "options require legacy fallback".into());
    }
    let kind = file.kind
        .as_deref()
        .or_else(|| file.path.rsplit('.').next())
        .unwrap_or("");
    let ts = matches!(kind, "ts" | "tsx" | "mts" | "cts");
    let source_type = match kind {
        // Babel parses every JS extension as a module with the jsx plugin enabled.
        "js" | "mjs" | "cjs" | "jsx" => SourceType::mjs().with_jsx(true),
        "ts" | "mts" | "cts" => SourceType::ts(),
        "tsx" => SourceType::tsx(),
        _ => return outcome(file, "unsupported", "unsupported file kind".into()),
    };
    let source = match &file.source {
        Some(s) => s.clone(),
        None => match std::fs::read_to_string(&file.path) {
            Ok(s) => s,
            Err(e) => return outcome(file, "read_error", e.to_string()),
        },
    };
    if source.starts_with("// @bit-no-check") || source.starts_with("/* @bit-no-check") {
        return Outcome {
            path: file.path.clone(),
            status: "ok",
            dependencies: IndexMap::new(),
            diagnostics: vec![],
        };
    }
    parse_source(file, &source, source_type, ts)
}
fn parse_source(file: &File, source: &str, source_type: SourceType, ts: bool) -> Outcome {
    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, source_type).parse();
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
    if !ts && let Some(result) = classification_outcome(file, &parsed.program) {
        return result;
    }
    let mut scanner = scanner_for_source(source, ts, &parsed.program.comments);
    scanner.visit_program(&parsed.program);
    if scanner.unsupported {
        return outcome(
            file,
            "unsupported",
            "decorators, import attributes/phases, or namespace reexports require legacy fallback"
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
fn process_request(input: &str, pool: &rayon::ThreadPool) -> Result<Value, serde_json::Error> {
    match serde_json::from_str::<Request>(input) {
        Ok(req) if req.version == 1 => serde_json::to_value(Response {
            version: 1,
            id: req.id,
            files: pool.install(|| {
                req.files
                    .par_iter()
                    .map(|file| scan(file, !req.options.is_empty()))
                    .collect()
            }),
        }),
        Ok(_) => Ok(
            serde_json::json!({"version":1,"status":"invalid_request","diagnostics":["unsupported protocol version"]}),
        ),
        Err(error) => Ok(
            serde_json::json!({"version":1,"status":"invalid_request","diagnostics":[error.to_string()]}),
        ),
    }
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let threads = if args.is_empty() {
        std::thread::available_parallelism()?.get().min(8)
    } else if args.len() == 2 && args[0] == "--threads" {
        args[1].parse::<usize>()?
    } else {
        return Err("usage: bit-dependency-scanner [--threads 1..64]".into());
    };
    if !(1..=64).contains(&threads) {
        return Err("threads must be in 1..64".into());
    }
    let pool = rayon::ThreadPoolBuilder::new().num_threads(threads).build()?;
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    for input in stdin.lock().lines() {
        let input = input?;
        let response = process_request(&input, &pool)?;
        serde_json::to_writer(&mut stdout, &response)?;
        writeln!(stdout)?;
        stdout.flush()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;

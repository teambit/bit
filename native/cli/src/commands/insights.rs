//! Native insight listing and `bit insights [names...]` (`scopes/explorer/insights/insights.cmd.ts`).

pub(super) mod render;
#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    graph_cmd::{builder::insight_graph, model::CompGraph, scope::scope_insight_graph},
    lane::scope_root::{self, ScopeRoot},
    scope_set::Failure,
    workspace_command::{self, results::Report},
};
use crate::{history::History, native::Outcome};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    env,
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "insights", aliases: &[], run };

const CORE_INSIGHTS: [&str; 2] = ["circular", "duplicate dependencies"];

#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct Options {
    pub list: bool,
    pub json: bool,
    pub include_deps: bool,
    pub names: Vec<String>,
}

struct EvaluatedInsight {
    message: String,
    rendered_data: String,
    json_entry: Value,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("insights arguments are not UTF-8".into()));
    };
    let Some(opts) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native insights grammar".into()));
    };
    let root_opt = scope_root::discover().ok().flatten();
    if opts.list {
        let rendered = serde_json::to_string_pretty(&json!(CORE_INSIGHTS))?;
        return emit_output(root_opt.as_ref(), args, opts.json, rendered);
    }
    run_named_insights(root_opt.as_ref(), args, &opts)
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut opts = Options::default();
    for &arg in args {
        match arg {
            "-l" | "--list" | "--list=true" => opts.list = true,
            "--list=false" => opts.list = false,
            "-j" | "--json" | "--json=true" => opts.json = true,
            "--json=false" => opts.json = false,
            "--include-deps" | "--include-deps=true" => opts.include_deps = true,
            "--include-deps=false" => opts.include_deps = false,
            "--no-color" => {}
            val if !val.starts_with('-') && !val.is_empty() => opts.names.push(val.to_owned()),
            _ => return None,
        }
    }
    if !opts.list && opts.names.is_empty() {
        opts.names = CORE_INSIGHTS
            .iter()
            .map(|&name| name.to_owned())
            .collect();
    }
    Some(opts)
}

fn run_named_insights(
    root_opt: Option<&ScopeRoot>,
    args: &[OsString],
    opts: &Options,
) -> io::Result<Outcome> {
    let needs_graph = opts.names
        .iter()
        .any(|name| CORE_INSIGHTS.contains(&name.as_str()));
    let graph_and_seeders = if needs_graph {
        let Some(root) = root_opt else {
            return emit_host_not_found();
        };
        let loaded =
            if root.bare { scope_insight_graph(&root.path) } else { insight_graph(&root.path) };
        match loaded {
            Ok(pair) => Some(pair),
            Err(Failure::Declined(reason) | Failure::User(reason)) => {
                return Ok(Outcome::Declined(format!("insights: {reason}")));
            }
        }
    } else {
        None
    };
    let chalk = Chalk::detect(args);
    let Some(results) = evaluate_insights(opts, graph_and_seeders.as_ref(), chalk) else {
        return Ok(Outcome::Declined("insights duplicate dependencies non-semver".into()));
    };
    if opts.json {
        let arr: Vec<Value> = results
            .into_iter()
            .map(|item| item.json_entry)
            .collect();
        let data = serde_json::to_string_pretty(&arr)?;
        return emit_output(root_opt, args, true, data);
    }
    let data = results
        .into_iter()
        .map(|item| {
            format!("\n{}\n  {}", chalk.cyan(&chalk.bold(&item.message)), item.rendered_data)
        })
        .collect::<Vec<_>>()
        .join("\n");
    emit_output(root_opt, args, false, data)
}

fn evaluate_insights(
    opts: &Options,
    graph_and_seeders: Option<&(CompGraph, Vec<String>)>,
    chalk: Chalk,
) -> Option<Vec<EvaluatedInsight>> {
    let mut results = Vec::new();
    for name in &opts.names {
        match name.as_str() {
            "circular" => {
                let (graph, seeders) = graph_and_seeders?;
                results.push(evaluate_circular(graph, seeders, opts.include_deps, chalk));
            }
            "duplicate dependencies" => {
                let (graph, seeders) = graph_and_seeders?;
                results.push(evaluate_duplicate_dependencies(graph, seeders)?);
            }
            _ => {}
        }
    }
    Some(results)
}

fn evaluate_circular(
    graph: &CompGraph,
    seeders: &[String],
    include_deps: bool,
    chalk: Chalk,
) -> EvaluatedInsight {
    let cycles = find_cycles(graph, seeders, include_deps);
    let count = cycles.len();
    let message = format!("Found {count} cycle{}.", if count == 1 { "" } else { "s" });
    let rendered_data = render::cycles(&cycles, chalk);
    let json_entry = json!({
        "metaData": {
            "name": "circular",
            "description": "Get all circular dependencies in component graph"
        },
        "message": message,
        "data": cycles,
    });
    EvaluatedInsight { message, rendered_data, json_entry }
}

fn evaluate_duplicate_dependencies(
    graph: &CompGraph,
    seeders: &[String],
) -> Option<EvaluatedInsight> {
    let (message, rendered_data, data) = render::duplicate_dependencies(graph, seeders)?;
    let json_entry = json!({
        "metaData": {
            "name": "duplicate dependencies",
            "description": "Get all duplicate dependencies in component graph"
        },
        "data": data,
        "message": message,
    });
    Some(EvaluatedInsight { message, rendered_data, json_entry })
}

fn emit_host_not_found() -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI insights error stack".into()));
    }
    let mut stdout = io::stdout().lock();
    writeln!(stdout, "Host was not found")?;
    stdout.flush()?;
    Ok(Outcome::Exit(ExitCode::from(1)))
}

fn emit_output(
    root_opt: Option<&ScopeRoot>,
    args: &[OsString],
    json_out: bool,
    rendered: String,
) -> io::Result<Outcome> {
    if json_out {
        let history =
            root_opt.filter(|root| !root.bare).map(|root| History::start(&root.path, args));
        let mut stdout = io::stdout().lock();
        stdout.write_all(rendered.as_bytes())?;
        stdout.flush()?;
        if let Some(history) = history {
            history.end(true);
        }
        return Ok(Outcome::Exit(ExitCode::SUCCESS));
    }
    let report = Report { data: rendered, code: 0, details: None };
    match root_opt {
        Some(root) if !root.bare => {
            workspace_command::execute_then(&root.path, args, "insights", |_| Ok(report))
        }
        Some(root) => workspace_command::execute_with_scope(&root.path, args, "insights", &report),
        None => {
            let mut stdout = io::stdout().lock();
            writeln!(stdout, "{}", report.data)?;
            stdout.flush()?;
            Ok(Outcome::Exit(ExitCode::SUCCESS))
        }
    }
}

/// Shared `GraphMain.getGraphIds().findCycles` projection for the two CLI commands.
pub(super) fn workspace_cycles(
    root: &std::path::Path,
    include_deps: bool,
) -> Result<Vec<Vec<String>>, Failure> {
    let (graph, seeders) = insight_graph(root)?;
    Ok(find_cycles(&graph, &seeders, include_deps))
}

/// `ComponentIdGraph.findCycles` reverses the Tarjan component order to show
/// the dependent before its dependency, then closes each cycle for display.
fn find_cycles(graph: &CompGraph, seeders: &[String], include_deps: bool) -> Vec<Vec<String>> {
    let positions: HashMap<&str, usize> = graph.nodes
        .iter()
        .enumerate()
        .map(|(i, id)| (id.as_str(), i))
        .collect();
    let mut edges = vec![Vec::new(); graph.nodes.len()];
    for edge in &graph.edges {
        if let (Some(&source), Some(&target)) =
            (positions.get(edge.source_id.as_str()), positions.get(edge.target_id.as_str()))
        {
            edges[source].push(target);
        }
    }
    let mut tarjan = Tarjan::new(&edges);
    for index in 0..graph.nodes.len() {
        if tarjan.indices[index].is_none() {
            tarjan.visit(index);
        }
    }
    tarjan.components
        .into_iter()
        .filter_map(|component| cycle_ids(component, &edges, graph, seeders, include_deps))
        .collect()
}

fn cycle_ids(
    mut component: Vec<usize>,
    edges: &[Vec<usize>],
    graph: &CompGraph,
    seeders: &[String],
    include_deps: bool,
) -> Option<Vec<String>> {
    if component.len() == 1 && !edges[component[0]].contains(&component[0]) {
        return None;
    }
    if !include_deps
        && !component
            .iter()
            .any(|&index| seeders.contains(&graph.nodes[index]))
    {
        return None;
    }
    component.reverse();
    let mut ids: Vec<String> = component
        .into_iter()
        .map(|index| graph.nodes[index].clone())
        .collect();
    ids.push(ids[0].clone());
    Some(ids)
}

struct Tarjan<'a> {
    edges: &'a [Vec<usize>],
    next: usize,
    indices: Vec<Option<usize>>,
    low: Vec<usize>,
    stack: Vec<usize>,
    on_stack: Vec<bool>,
    components: Vec<Vec<usize>>,
}

impl<'a> Tarjan<'a> {
    fn new(edges: &'a [Vec<usize>]) -> Self {
        let size = edges.len();
        Self {
            edges,
            next: 0,
            indices: vec![None; size],
            low: vec![0; size],
            stack: Vec::new(),
            on_stack: vec![false; size],
            components: Vec::new(),
        }
    }

    fn visit(&mut self, node: usize) {
        self.indices[node] = Some(self.next);
        self.low[node] = self.next;
        self.next += 1;
        self.stack.push(node);
        self.on_stack[node] = true;
        self.visit_targets(node);
        if self.low[node] == self.indices[node].unwrap_or_default() {
            self.close_component(node);
        }
    }

    fn visit_targets(&mut self, node: usize) {
        for &target in &self.edges[node] {
            if self.indices[target].is_none() {
                self.visit(target);
                self.low[node] = self.low[node].min(self.low[target]);
            } else if self.on_stack[target] {
                self.low[node] = self.low[node].min(self.indices[target].unwrap_or_default());
            }
        }
    }

    fn close_component(&mut self, node: usize) {
        let mut component = Vec::new();
        while let Some(member) = self.stack.pop() {
            self.on_stack[member] = false;
            component.push(member);
            if member == node {
                break;
            }
        }
        self.components.push(component);
    }
}

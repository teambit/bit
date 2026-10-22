//! Native insight listing and `bit insights circular` (`scopes/explorer/insights/insights.cmd.ts`).

pub(super) mod render;
#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    graph_cmd::{builder::insight_graph, model::CompGraph},
    lane::scope_root,
    scope_set::Failure,
    workspace_command::{self, results::Report},
};
use crate::{history::History, native::Outcome, workspace};
use serde_json::json;
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
    pub circular: bool,
    pub include_deps: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("insights arguments are not UTF-8".into()));
    };
    let Some(opts) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native insights grammar".into()));
    };
    if opts.circular {
        return run_circular(args, &opts);
    }
    let rendered = serde_json::to_string_pretty(&json!(CORE_INSIGHTS))?;
    let root_opt = scope_root::discover().ok().flatten();
    if opts.json {
        let history = root_opt
            .as_ref()
            .filter(|root| !root.bare)
            .map(|root| History::start(&root.path, args));
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

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut opts = Options::default();
    for &arg in args {
        match arg {
            "-l" | "--list" => opts.list = true,
            "-j" | "--json" => opts.json = true,
            "circular" if !opts.circular && !opts.list => opts.circular = true,
            "--include-deps" => opts.include_deps = true,
            _ => return None,
        }
    }
    (opts.list || opts.circular).then_some(opts)
}

fn run_circular(args: &[OsString], opts: &Options) -> io::Result<Outcome> {
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("insights circular requires a workspace".into()));
    };
    let cycles = match workspace_cycles(&root, opts.include_deps) {
        Ok(cycles) => cycles,
        Err(Failure::Declined(reason) | Failure::User(reason)) => {
            return Ok(Outcome::Declined(format!("insights circular: {reason}")));
        }
    };
    let count = cycles.len();
    let message = format!("Found {count} cycle{}.", if count == 1 { "" } else { "s" });
    if !opts.json {
        let chalk = Chalk::detect(args);
        let rendered = render::cycles(&cycles, chalk);
        let data = format!("\n{}\n  {rendered}", chalk.cyan(&chalk.bold(&message)));
        return workspace_command::execute_then(&root, args, "insights", |_| {
            Ok(Report { data, code: 0, details: None })
        });
    }
    let data = serde_json::to_string_pretty(&json!([{
        "metaData": {
            "name": "circular",
            "description": "Get all circular dependencies in component graph"
        },
        "message": message,
        "data": cycles,
    }]))?;
    workspace_command::execute_json(&root, args, "insights", |_| {
        Ok(Report { data, code: 0, details: None })
    })
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

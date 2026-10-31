//! Graph model and table rendering for `bit dependents` (`scopes/dependencies/dependencies/template.ts`).

use crate::commands::{color::Chalk, list::table::strip_sgr};
use serde::Serialize;
use std::collections::{HashSet, VecDeque};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(super) struct DependentInfo {
    pub id: String,
    pub depth: usize,
    pub parent: String,
    #[serde(rename = "dependencyType")]
    pub dependency_type: String,
}

#[derive(Debug, Default, Clone)]
pub(super) struct DepGraph {
    nodes: HashSet<String>,
    edges: Vec<(String, String, &'static str)>,
}

impl DepGraph {
    pub(super) fn add_node(&mut self, id: String) {
        self.nodes.insert(id);
    }

    pub(super) fn add_edge(&mut self, src: String, dst: String, dep_type: &'static str) {
        self.nodes.insert(src.clone());
        self.nodes.insert(dst.clone());
        if let Some(existing) = self.edges
            .iter_mut()
            .find(|(edge_src, edge_dst, _)| *edge_src == src && *edge_dst == dst)
        {
            existing.2 = dep_type;
        } else {
            self.edges.push((src, dst, dep_type));
        }
    }

    pub(super) fn dependents_of(&self, target_id: &str) -> Vec<DependentInfo> {
        let mut visited: HashSet<String> = HashSet::from([target_id.to_owned()]);
        let mut queue: VecDeque<(String, usize)> = VecDeque::from([(target_id.to_owned(), 0usize)]);
        let mut results = Vec::new();
        while let Some((curr_id, dist)) = queue.pop_front() {
            for (src, dst, dep_type) in &self.edges {
                if *dst == curr_id && visited.insert(src.clone()) {
                    results.push(DependentInfo {
                        id: src.clone(),
                        depth: dist + 1,
                        parent: curr_id.clone(),
                        dependency_type: (*dep_type).to_owned(),
                    });
                    queue.push_back((src.clone(), dist + 1));
                }
            }
        }
        results.sort_by_key(|info| info.depth);
        results
    }
}

pub(super) fn render_dependents_report(
    target_id: &str,
    bare_id: &str,
    workspace_dependents: &[DependentInfo],
    scope_dependents: &[DependentInfo],
    chalk: Chalk,
) -> String {
    if workspace_dependents.is_empty() && scope_dependents.is_empty() {
        return format!(
            "no dependents found for {target_id}.\ntry running \"bit cat-component {bare_id}\" to see whether the component/version exists locally",
        );
    }
    let ws_table = render_dependents_table(workspace_dependents, target_id, chalk);
    let scope_table = render_dependents_table(scope_dependents, target_id, chalk);
    format!(
        "{}\n{}\n\n{}\n{}",
        chalk.bold("Dependents originated from workspace"),
        if ws_table.is_empty() { "<none>" } else { &ws_table },
        chalk.bold("Dependents originated from scope"),
        if scope_table.is_empty() { "<none>" } else { &scope_table },
    )
}

fn render_dependents_table(dependents: &[DependentInfo], target_id: &str, chalk: Chalk) -> String {
    if dependents.is_empty() {
        return String::new();
    }
    let mut rows = Vec::with_capacity(dependents.len() + 1);
    rows.push(vec![
        chalk.cyan("Dependent ID"),
        chalk.cyan("Depth"),
        chalk.cyan("Immediate Dependency"),
        chalk.cyan("Dependent type"),
    ]);
    for dep in dependents {
        let immediate =
            if dep.parent == target_id { "<self>".to_owned() } else { dep.parent.clone() };
        rows.push(vec![
            dep.id.clone(),
            dep.depth.to_string(),
            immediate,
            dep.dependency_type.clone(),
        ]);
    }
    let table_str = render_honeywell_table(&rows);
    format!("\n{}\n{table_str}", chalk.bold("Dependents Details"))
}

pub(in crate::commands) fn render_honeywell_table(rows: &[Vec<String>]) -> String {
    let widths = column_widths(rows);
    let mut out = String::new();
    out.push_str(&honeywell_border(&widths, '╔', '═', '╤', '╗'));
    out.push('\n');
    for (row_idx, row) in rows.iter().enumerate() {
        if row_idx > 0 {
            out.push_str(&honeywell_border(&widths, '╟', '─', '┼', '╢'));
            out.push('\n');
        }
        out.push_str(&render_honeywell_row(row, &widths));
    }
    out.push_str(&honeywell_border(&widths, '╚', '═', '╧', '╝'));
    out.push('\n');
    out
}

fn column_widths(rows: &[Vec<String>]) -> Vec<usize> {
    let col_count = rows
        .iter()
        .map(Vec::len)
        .max()
        .unwrap_or(0);
    let mut widths = vec![0usize; col_count];
    for row in rows {
        for (idx, cell) in row.iter().enumerate() {
            let visible_len = strip_sgr(cell).encode_utf16().count();
            widths[idx] = widths[idx].max(visible_len);
        }
    }
    widths
}

fn render_honeywell_row(row: &[String], widths: &[usize]) -> String {
    let cells = row
        .iter()
        .enumerate()
        .map(|(col_idx, cell)| {
            let visible_len = strip_sgr(cell).encode_utf16().count();
            let col_width = widths
                .get(col_idx)
                .copied()
                .unwrap_or(0);
            let pad = col_width.saturating_sub(visible_len);
            format!(" {cell}{} ", " ".repeat(pad))
        })
        .collect::<Vec<_>>()
        .join("│");
    format!("║{cells}║\n")
}

fn honeywell_border(widths: &[usize], left: char, fill: char, mid: char, right: char) -> String {
    let segments = widths
        .iter()
        .map(|width| fill.to_string().repeat(*width + 2))
        .collect::<Vec<_>>()
        .join(&mid.to_string());
    format!("{left}{segments}{right}")
}

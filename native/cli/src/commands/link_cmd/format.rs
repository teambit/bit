//! Output formatting (`report` and `--json`) for `bit link` (`link.cmd.ts`).

use super::{Options, rewire::CodemodResult, target::LinkToDirResult};
use crate::commands::{color::Chalk, workspace_command::format::Formatter};
use serde_json::{Value, json};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct BoundLink {
    pub from: String,
    pub to: String,
    pub exists_before: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ComponentLinkItem {
    pub id: String,
    pub package_name: String,
    pub bound: Vec<BoundLink>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct LinkSummary {
    pub workspace_name: String,
    pub component_links: Vec<ComponentLinkItem>,
    pub codemod_results: Vec<CodemodResult>,
    pub target_links: Vec<LinkToDirResult>,
}

pub(super) fn render_json(summary: &LinkSummary) -> Value {
    let mut map = serde_json::Map::new();
    if !summary.target_links.is_empty() {
        map.insert(
            "linkToDirResults".into(),
            Value::Array(target_links_json(&summary.target_links)),
        );
    }
    map.insert(
        "legacyLinkResults".into(),
        Value::Array(legacy_links_json(&summary.component_links)),
    );
    map.insert(
        "legacyLinkCodemodResults".into(),
        Value::Array(codemods_json(&summary.codemod_results)),
    );
    Value::Object(map)
}

fn legacy_links_json(items: &[ComponentLinkItem]) -> Vec<Value> {
    items
        .iter()
        .map(|item| {
            let bound: Vec<Value> = item.bound
                .iter()
                .map(|link| {
                    json!({
                        "from": link.from,
                        "to": link.to,
                        "existsBefore": link.exists_before,
                    })
                })
                .collect();
            json!({
                "id": item.id,
                "bound": bound,
            })
        })
        .collect()
}

fn codemods_json(items: &[CodemodResult]) -> Vec<Value> {
    items
        .iter()
        .map(|item| {
            json!({
                "id": item.id,
                "changedFiles": item.changed_files,
                "warnings": [],
            })
        })
        .collect()
}

fn target_links_json(items: &[LinkToDirResult]) -> Vec<Value> {
    items
        .iter()
        .map(|item| {
            json!({
                "componentId": item.component_id,
                "linksDetail": {
                    "packageName": item.links_detail.package_name,
                    "from": item.links_detail.from,
                    "to": item.links_detail.to,
                },
            })
        })
        .collect()
}

pub(super) fn render_report(
    formatter: &Formatter,
    summary: &LinkSummary,
    options: &Options,
) -> String {
    let chalk = formatter.chalk;
    let num_comps = summary.component_links.len();
    let title = formatter.title(&format!(
        "Linked {num_comps} components and 0 core aspects to node_modules for workspace: {}",
        summary.workspace_name,
    ));
    let core_links = chalk.cyan("No core aspects were linked");
    let comps_links = format_component_links(
        chalk,
        &summary.component_links,
        options.verbose,
        options.comp_summary,
    );
    let rewire_row = format_rewire_row(chalk, &summary.codemod_results);
    let target_links = format_target_links(chalk, &summary.target_links);
    let footer = formatter.hint("Finished. (1ms)");
    Formatter::join(&[title, core_links, comps_links, rewire_row, target_links, footer])
}

fn format_component_links(
    chalk: Chalk,
    items: &[ComponentLinkItem],
    verbose: bool,
    comp_summary: bool,
) -> String {
    if items.is_empty() {
        return chalk.cyan("No components link were generated");
    }
    if comp_summary {
        return chalk.cyan(&format!("{} components were linked", items.len()));
    }
    let header = chalk.bold(&chalk.cyan("Components links"));
    let rows: Vec<String> = items
        .iter()
        .map(|item| {
            if verbose {
                format_verbose_component_link(chalk, item)
            } else {
                format_regular_component_link(chalk, item)
            }
        })
        .filter(|row| !row.is_empty())
        .collect();
    if rows.is_empty() { header } else { format!("{header}\n{}", rows.join("\n")) }
}

fn format_regular_component_link(chalk: Chalk, item: &ComponentLinkItem) -> String {
    if item.bound.is_empty() {
        return String::new();
    }
    let target = format!("./node_modules/{}", item.package_name);
    format_link_row(chalk, &item.id, &target)
}

fn format_verbose_component_link(chalk: Chalk, item: &ComponentLinkItem) -> String {
    if item.bound.is_empty() {
        return String::new();
    }
    let title = chalk.bold(&chalk.cyan(&item.id));
    let links: Vec<String> = item.bound
        .iter()
        .map(|link| {
            format!("{}: {}\n{}: {}\n", chalk.bold("from"), link.from, chalk.bold("to"), link.to)
        })
        .collect();
    format!("{title}\n{}\n", links.join("\n"))
}

fn format_rewire_row(chalk: Chalk, codemod_results: &[CodemodResult]) -> String {
    if codemod_results.is_empty() {
        return String::new();
    }
    let total_comps = codemod_results.len();
    let total_files: usize = codemod_results
        .iter()
        .map(|item| item.changed_files.len())
        .sum();
    format!(
        "rewired {} components and total of {} files",
        chalk.cyan(&total_comps.to_string()),
        chalk.cyan(&total_files.to_string()),
    )
}

fn format_target_links(chalk: Chalk, target_links: &[LinkToDirResult]) -> String {
    if target_links.is_empty() {
        return String::new();
    }
    let title = chalk.bold(&chalk.cyan("Target Links"));
    let rows: Vec<String> = target_links
        .iter()
        .map(|item| format_link_row(chalk, &item.component_id, &item.links_detail.to))
        .collect();
    format!("{title}\n{}", rows.join("\n"))
}

fn format_link_row(chalk: Chalk, title: &str, target: &str) -> String {
    chalk.bold(&format!("{title:<50} > {target}"))
}

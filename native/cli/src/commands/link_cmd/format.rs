//! Output formatting (`report` and `--json`) for `bit link` (`link.cmd.ts`).
//!
//! Renders [`LinkSummary`], [`BoundLink`], [`CodemodResult`], and [`LinkToDirResult`] summaries with [`Formatter`].

use super::{Options, rewire::CodemodResult, target::LinkToDirResult};
use crate::commands::{color::Chalk, workspace_command::format::Formatter};
use serde_json::{Value, json};

/// Single file or directory symlink created inside a component's `node_modules` package.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct BoundLink {
    pub from: String,
    pub to: String,
    pub exists_before: bool,
}

/// Summary of `node_modules` links created for a single workspace component.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ComponentLinkItem {
    pub id: String,
    pub package_name: String,
    pub bound: Vec<BoundLink>,
}

/// Aggregated component links, `--rewire` codemod results, and `--target` directory links for `bit link`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct LinkSummary {
    pub workspace_name: String,
    pub component_links: Vec<ComponentLinkItem>,
    pub codemod_results: Vec<CodemodResult>,
    pub target_links: Vec<LinkToDirResult>,
}

/// Serializes `summary` into the `--json` output object for `bit link`.
#[inline]
pub(super) fn render_json(summary: &LinkSummary) -> Value {
    let mut map = serde_json::Map::with_capacity(3);
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

/// Converts [`ComponentLinkItem`] entries into the `legacyLinkResults` JSON array.
#[inline]
fn legacy_links_json(items: &[ComponentLinkItem]) -> Vec<Value> {
    items
        .iter()
        .map(|item| {
            let bound: Vec<Value> = item.bound
                .iter()
                .map(|link| {
                    json!({
                        "from": link.from.trim(),
                        "to": link.to.trim(),
                        "existsBefore": link.exists_before,
                    })
                })
                .collect();
            json!({
                "id": item.id.trim(),
                "bound": bound,
            })
        })
        .collect()
}

/// Converts [`CodemodResult`] entries into the `legacyLinkCodemodResults` JSON array.
#[inline]
fn codemods_json(items: &[CodemodResult]) -> Vec<Value> {
    items
        .iter()
        .map(|item| {
            json!({
                "id": item.id.trim(),
                "changedFiles": item.changed_files,
                "warnings": [],
            })
        })
        .collect()
}

#[inline]
fn target_links_json(items: &[LinkToDirResult]) -> Vec<Value> {
    items
        .iter()
        .map(|item| {
            json!({
                "componentId": item.component_id.trim(),
                "linksDetail": {
                    "packageName": item.links_detail.package_name.trim(),
                    "from": item.links_detail.from.trim(),
                    "to": item.links_detail.to.trim(),
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

#[inline]
fn format_regular_component_link(chalk: Chalk, item: &ComponentLinkItem) -> String {
    let pkg = item.package_name.trim();
    if item.bound.is_empty() || pkg.is_empty() {
        return String::new();
    }
    let target = format!("./node_modules/{pkg}");
    format_link_row(chalk, item.id.trim(), &target)
}

#[inline]
fn format_verbose_component_link(chalk: Chalk, item: &ComponentLinkItem) -> String {
    if item.bound.is_empty() {
        return String::new();
    }
    let title = chalk.bold(&chalk.cyan(item.id.trim()));
    let from_label = chalk.bold("from");
    let to_label = chalk.bold("to");
    let links: Vec<String> = item.bound
        .iter()
        .map(|link| format!("{from_label}: {}\n{to_label}: {}\n", link.from.trim(), link.to.trim()))
        .collect();
    format!("{title}\n{}\n", links.join("\n"))
}

#[inline]
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

#[inline]
fn format_target_links(chalk: Chalk, target_links: &[LinkToDirResult]) -> String {
    if target_links.is_empty() {
        return String::new();
    }
    let title = chalk.bold(&chalk.cyan("Target Links"));
    let rows: Vec<String> = target_links
        .iter()
        .map(|item| format_link_row(chalk, item.component_id.trim(), item.links_detail.to.trim()))
        .collect();
    format!("{title}\n{}", rows.join("\n"))
}

#[inline]
fn format_link_row(chalk: Chalk, title: &str, target: &str) -> String {
    chalk.bold(&format!("{title:<50} > {target}"))
}

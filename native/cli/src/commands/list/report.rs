//! `ListCmd` JSON and table presentation using the published listTemplate field order.

use super::{Options, Row, WorkspaceRow, table};
use crate::commands::color::Chalk;
use serde_json::{Map, Value, json};

/// `ListCmd.json`: the ids, or `listTemplate(results, true, false)`.
pub(super) fn json_report(rows: &[Row], ids: bool) -> Value {
    if ids {
        return json!(
            rows.iter()
                .map(Row::id)
                .collect::<Vec<_>>()
        );
    }
    Value::Array(
        rows.iter()
            .map(|row| {
                let mut data = Map::new();
                data.insert("id".into(), json!(row.identity));
                data.insert("localVersion".into(), json!(local_version(row)));
                if let Some(deprecated) = row.deprecated {
                    data.insert("deprecated".into(), json!(deprecated));
                }
                data.insert("currentVersion".into(), json!(current_version(&row.workspace)));
                data.insert("remoteVersion".into(), json!(remote_version(row)));
                if let Some(removed) = row.removed {
                    data.insert("removed".into(), json!(removed));
                }
                if let Some(root_dir) = row.workspace.root_dir
                    .as_deref()
                    .map(str::trim)
                    .filter(|dir| !dir.is_empty())
                {
                    data.insert("rootDir".into(), json!(root_dir));
                }
                Value::Object(data)
            })
            .collect(),
    )
}

fn local_version(row: &Row) -> &str {
    row.version
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("<new>")
}

fn current_version(row: &WorkspaceRow) -> &str {
    row.used
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("N/A")
}

fn remote_version(row: &Row) -> &str {
    row.remote_version
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("N/A")
}

/// `ListCmd.report`: the count, then the ids or the table.
pub(super) fn report(rows: &[Row], options: &Options, chalk: Chalk, colors: bool) -> String {
    let header = options.remote
        .as_deref()
        .map(str::trim)
        .filter(|remote| !remote.is_empty())
        .map_or_else(
            || format!("found {} components\n", rows.len()),
            |remote| {
                chalk.white(&format!("found {} components in {}\n", rows.len(), chalk.bold(remote)))
            },
        );
    if rows.is_empty() {
        return header;
    }
    if options.ids {
        return serde_json::to_string(
            &rows
                .iter()
                .map(Row::id)
                .collect::<Vec<_>>(),
        )
        .unwrap_or_default();
    }
    let rendered = render_table(rows, options, chalk, colors);
    let mut report = header;
    report.push_str(&rendered);
    report
}

fn render_table(rows: &[Row], options: &Options, chalk: Chalk, colors: bool) -> String {
    let has_path = rows
        .iter()
        .any(|row| {
            row.workspace.root_dir
                .as_deref()
                .is_some_and(|dir| !dir.trim().is_empty())
        });
    let mut head = vec!["component ID", "latest in scope", "used in workspace"];
    if options.outdated {
        head.push("latest in remote scope");
    }
    if has_path {
        head.push("path");
    }
    let cells: Vec<Vec<String>> = rows
        .iter()
        .map(|row| {
            let mut cells = vec![
                formatted_id(row, chalk),
                colored_version(row, options.outdated, false, chalk),
                current_version(&row.workspace).to_string(),
            ];
            if options.outdated {
                cells.push(colored_version(row, true, true, chalk));
            }
            if has_path {
                cells.push(
                    row.workspace.root_dir
                        .as_deref()
                        .map(str::trim)
                        .unwrap_or_default()
                        .to_string(),
                );
            }
            cells
        })
        .collect();
    table::render(&head, &cells, colors)
}

/// `getFormattedId` of `listTemplate`.
fn formatted_id(row: &Row, chalk: Chalk) -> String {
    let mut id = chalk.white(&row.identity);
    if row.deprecated == Some(true) {
        id = chalk.yellow(&format!("{id} [Deprecated]"));
    }
    if row.removed == Some(true) {
        id = chalk.red(&format!("{id} [Deleted]"));
    }
    if !row.lane_readme_of.is_empty() {
        id.push('\n');
        for lane in &row.lane_readme_of {
            id.push_str(&chalk.yellow(&format!("[Lane Readme]: {lane}\n")));
        }
    }
    id
}

fn colored_version(row: &Row, outdated: bool, remote: bool, chalk: Chalk) -> String {
    let local = local_version(row);
    let latest = remote_version(row);
    let text = if remote { latest } else { local };
    let comparison = row.remote_version
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(|latest| node_semver::npm::compare(local, latest, false));
    let color = if remote { std::cmp::Ordering::Greater } else { std::cmp::Ordering::Less };
    if outdated && comparison == Some(color) { chalk.red(text) } else { text.to_string() }
}

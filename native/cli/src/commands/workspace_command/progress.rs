//! `commandProgress(progress, operation)`: the progress lines Bit's loader
//! prints while checkout runs. The receipt is validated before anything is
//! printed or written.

mod history;
mod inbound;

use crate::commands::status::js::{array, decline, text};
use bit_install::output::Output;
use serde_json::Value;
use std::{collections::HashSet, io, time::Instant};

const REASONS: [&str; 5] = [
    "of their latest on main",
    "for getting missing versions and dependencies",
    "for making sure the new components are really new and are not out-of-sync",
    "import all history of given patterns components to check whether they have dependencies on the lane",
    "to import new components from the defaultScope",
];

/// One import the engine ran: why, which ids, and how much it fetched.
struct Import {
    requested: Option<u64>,
    reason: Option<String>,
    ids: Vec<String>,
    objects_only: bool,
    components: u64,
    objects: u64,
}

pub struct Progress {
    bitmap_count: u64,
    imports: Vec<Import>,
    /// Components loaded per stage, for merge and snap.
    loads: Vec<u64>,
    /// The imports of the dependencies graph step, for snap.
    graph_imports: Vec<Import>,
    snap_failed: bool,
    skip_dependencies_graph: bool,
    version_notice: String,
}

impl Progress {
    /// The validated receipt; `None` when the engine reported none.
    pub fn parse(value: Option<&Value>) -> io::Result<Option<Self>> {
        Self::parse_for(value, false)
    }

    /// The receipt of a snap: five load stages and graph imports allowed.
    pub fn parse_snap(value: Option<&Value>) -> io::Result<Option<Self>> {
        Self::parse_for(value, true)
    }

    fn parse_for(value: Option<&Value>, snap: bool) -> io::Result<Option<Self>> {
        let Some(value) = value.filter(|value| !value.is_null()) else { return Ok(None) };
        let bitmap_count = value.get("bitmapCount").and_then(Value::as_u64);
        let bitmap_count = bitmap_count.ok_or_else(|| decline("native command progress receipt"))?;
        let loads = loads(value, snap)?;
        let (imports, graph_imports) = progress_imports(value, snap)?;
        let snap_failed = value.get("snapFailed") == Some(&Value::Bool(true));
        let skip_dependencies_graph = value["skipDependenciesGraph"] == true;
        let version_notice = value["versionNotice"]
            .as_str()
            .filter(|notice| !notice.trim().is_empty())
            .unwrap_or_default()
            .to_string();
        Ok(Some(Self {
            bitmap_count,
            imports,
            loads,
            graph_imports,
            snap_failed,
            skip_dependencies_graph,
            version_notice,
        }))
    }

    /// Print the lines, as the loader does while merge runs.
    pub fn render_merge(&self, output: &Output) {
        for row in &self.imports {
            render_import(output, row);
        }
        for count in &self.loads {
            output.status(&format!("loading {count} component(s)"));
        }
        self.render_graph(output);
    }

    /// Lane providers start after fetching lane heads and before divergence imports.
    pub fn render_merge_startup(&self, output: &Output, startup: &str, loaded: &str) {
        let split = self.imports
            .iter()
            .position(|row| {
                row.reason
                    .as_deref()
                    .is_some_and(|reason| {
                        reason.starts_with("for getting the common-snap between ")
                            || reason.starts_with("for filling the gap between ")
                    })
            })
            .unwrap_or(self.imports.len());
        for row in &self.imports[..split] {
            render_import(output, row);
        }
        print!("{startup}{loaded}");
        for row in &self.imports[split..] {
            render_import(output, row);
        }
        for count in &self.loads {
            output.status(&format!("loading {count} component(s)"));
        }
        self.render_graph(output);
    }

    /// Snapshot graph progress after extension issue and pre-snap callbacks.
    pub fn render_graph(&self, output: &Output) {
        if !self.version_notice.is_empty() {
            output.raw(&self.version_notice);
        }
        if !self.loads.is_empty() && !self.snap_failed {
            output.status("importing missing dependencies...");
            for row in &self.graph_imports {
                render_import(output, row);
            }
            if !self.skip_dependencies_graph {
                output.status("adding dependencies graph...");
            }
        }
    }

    /// Soft tags load component state but do not import dependencies or create a graph.
    pub fn render_soft_tag(&self, output: &Output) {
        for row in &self.imports {
            render_import(output, row);
        }
        for count in &self.loads {
            output.status(&format!("loading {count} component(s)"));
        }
    }

    fn render_checkout_initial(&self, output: &Output) {
        let fetching = [REASONS[0], REASONS[1]];
        for row in self.imports
            .iter()
            .filter(|row| {
                row.reason
                    .as_deref()
                    .is_some_and(|reason| {
                        fetching.contains(&reason) || reason.starts_with("of their latest on lane ")
                    })
            })
        {
            if row.reason.as_deref() == Some(REASONS[1]) {
                output.status(&format!(
                    "import {} components with their dependencies (if missing)",
                    self.bitmap_count,
                ));
            }
            render_import(output, row);
        }
    }

    /// Print the lines, as the loader does while checkout runs.
    /// `checkout main` has already imported its target objects during the
    /// initial latest-on-main fetch; Harmony does not print the second import.
    pub fn render_checkout_with(&self, output: &Output, main: bool, revert: bool) {
        output.status(if revert {
            "reverting components..."
        } else {
            "switching component version..."
        });
        output.status("importing components");
        let started = Instant::now();
        self.render_checkout_initial(output);
        output.success("importing components", Some(started));
        for count in &self.loads {
            output.status(&format!("loading {count} component(s)"));
        }

        for row in self.imports
            .iter()
            .filter(|row| {
                !main
                    && (row.reason.is_none()
                        || row.reason
                            .as_deref()
                            .is_some_and(|reason| [REASONS[2], REASONS[4]].contains(&reason)))
            })
        {
            render_import(output, row);
        }
    }

    /// `LanesMain` invokes `Checkout.checkout` directly, without `checkoutByCLIValues` statuses.
    pub(in crate::commands) fn render_lane_history(&self, output: &Output) {
        for row in &self.imports {
            render_import(output, row);
        }
        for count in &self.loads {
            output.status(&format!("loading {count} component(s)"));
        }
    }
}

fn render_lane_tail(row: Option<&Import>, output: &Output) {
    if let Some(row) = row
        && row.ids.is_empty()
        && let Some(count) = row.requested
    {
        output.success(
            &format!("import {count} components with their dependencies (if missing)"),
            None,
        );
        return;
    }
    if let Some(row) = row
        && !row.ids.is_empty()
        && let Some(reason) = &row.reason
    {
        let count = if row.components > 0 {
            format!("{} components", row.components)
        } else {
            format!("{} objects", row.objects)
        };
        output.success(&format!("successfully imported {count} {reason}"), None);
    }
}

/// The components loaded per stage: four stages, five for a snap.
fn loads(value: &Value, snap: bool) -> io::Result<Vec<u64>> {
    let loads = array(value.get("loads"), "loads")?;
    let counts: Vec<u64> = loads
        .iter()
        .filter_map(Value::as_u64)
        .filter(|count| *count <= 4096)
        .collect();
    if counts.len() != loads.len() || loads.len() > if snap { 4096 } else { 4 } {
        return Err(decline("native command progress receipt"));
    }
    Ok(counts)
}

fn import(row: &Value) -> io::Result<Import> {
    let reason = match row.get("reason") {
        Some(Value::Null) => None,
        Some(Value::String(reason)) if known_reason(reason) => Some(reason.clone()),
        _ => return Err(decline("native command import progress receipt")),
    };
    let ids = array(row.get("ids"), "import ids")?
        .iter()
        .map(|id| text(Some(id)).map(str::to_string))
        .collect::<io::Result<Vec<_>>>()?;
    let objects_only = match row.get("objectRequest") {
        None => false,
        Some(Value::Bool(value)) => *value,
        Some(_) => return Err(decline("native command import progress receipt")),
    };
    let count = |key: &str| {
        row.get(key)
            .and_then(Value::as_u64)
            .ok_or_else(|| decline("native command import progress receipt"))
    };
    let (components, objects) = (count("components")?, count("objects")?);
    if ids.len() > 16384 || objects > 16384 {
        return Err(decline("native command import progress receipt"));
    }
    let requested = row.get("requested").and_then(Value::as_u64);
    if requested.is_some_and(|count| count > 16384) {
        return Err(decline("native command import requested count"));
    }
    Ok(Import { requested, reason, ids, objects_only, components, objects })
}

/// `importReason`: the fixed reasons, and the lane and history templates.
fn known_reason(reason: &str) -> bool {
    if matches!(
        reason,
        "for getting all dependencies"
            | "for getting all dependencies - missing dependencies"
            | "for building graph-ids from the workspace",
    ) {
        return true;
    }
    REASONS.contains(&reason)
        || reason.strip_prefix("for fetching lane ").is_some_and(lane_name)
        || reason.strip_prefix("of their latest on lane ").is_some_and(lane_name)
        || reason
            .strip_prefix("for filling the gap between the common-snap and the head of ")
            .is_some_and(lane_name)
        || reason
            .strip_prefix("for getting the common-snap between ")
            .is_some_and(|rest| {
                rest.split_once(" and ")
                    .is_some_and(|(a, b)| no_space(a) && no_space(b))
            })
        || reason
            .strip_prefix("to get all artifacts for ")
            .is_some_and(|rest| {
                rest.split_once(" components from lane ")
                    .is_some_and(|(count, lane)| {
                        !count.is_empty()
                            && count.bytes().all(|b| b.is_ascii_digit())
                            && lane_name(lane)
                    })
            })
}

fn no_space(text: &str) -> bool {
    !text.is_empty() && !text.chars().any(char::is_whitespace)
}

/// `[^/\s]+\/[^/\s]+`.
fn lane_name(text: &str) -> bool {
    text.trim()
        .split_once('/')
        .is_some_and(|(scope, name)| no_space(scope) && no_space(name) && !name.contains('/'))
}

/// `renderImport`.
fn render_import(output: &Output, row: &Import) {
    if row.ids.is_empty() {
        return;
    }
    let message = import_message(row);
    let reason = row.reason
        .as_ref()
        .map_or_else(String::new, |reason| format!(" {reason}"));
    // `ObjectsFetcher` starts the loader itself, so its lines show on CI too.
    output.restart(&message);
    if std::env::var_os("CI").is_none() {
        for downloaded in (100..=row.objects).step_by(100) {
            output.status(&format!("{message}. downloaded {downloaded} objects."));
        }
    }
    let imported = if row.components > 0 {
        format!("{} components", row.components)
    } else {
        format!("{} objects", row.objects)
    };
    output.restart(&format!("successfully imported {imported}{reason}"));
}

fn import_message(row: &Import) -> String {
    let names: HashSet<&str> = row.ids
        .iter()
        .map(|id| without_version(id))
        .collect();
    let ids = if row.objects_only {
        format!("{} objects", row.ids.len())
    } else if names.len() == row.ids.len() {
        format!("{} components", names.len())
    } else {
        format!("{} components, {} versions", names.len(), row.ids.len())
    };
    let reason = row.reason
        .as_ref()
        .map_or_else(String::new, |reason| format!(" {reason}"));
    format!("importing {ids}{reason}")
}

/// `id.replace(/@[^@]+$/, '')`.
fn without_version(id: &str) -> &str {
    let id = id.trim();
    match id.rfind('@') {
        Some(index) if index + 1 < id.len() => id[..index].trim(),
        _ => id,
    }
}

fn progress_imports(value: &Value, snap: bool) -> io::Result<(Vec<Import>, Vec<Import>)> {
    let graph_imports = match value.get("graphImports") {
        None | Some(Value::Null) => &[][..],
        graph => array(graph, "graph imports")?,
    };
    let snap_failed = value.get("snapFailed").is_none_or(Value::is_boolean);
    if (!snap && !graph_imports.is_empty()) || !snap_failed {
        return Err(decline("native command progress receipt"));
    }
    let rows = value
        .get("imports")
        .and_then(Value::as_array)
        .ok_or_else(|| decline("native command progress receipt"))?;
    if rows.len() + graph_imports.len() > 16384 {
        return Err(decline("native command import progress receipt"));
    }
    let imports = rows
        .iter()
        .map(import)
        .collect::<io::Result<_>>()?;
    let graph_imports = graph_imports
        .iter()
        .map(import)
        .collect::<io::Result<_>>()?;
    Ok((imports, graph_imports))
}

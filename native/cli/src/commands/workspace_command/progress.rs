//! `commandProgress(progress, operation)`: the progress lines Bit's loader
//! prints while checkout runs. The receipt is validated before anything is
//! printed or written.

use crate::commands::status::js::{array, decline, text};
use bit_install::output::Output;
use serde_json::Value;
use std::{collections::HashSet, io, time::Instant};

const REASONS: [&str; 4] = [
    "of their latest on main",
    "for getting missing versions and dependencies",
    "for making sure the new components are really new and are not out-of-sync",
    "import all history of given patterns components to check whether they have dependencies on the lane",
];

/// One import the engine ran: why, which ids, and how much it fetched.
struct Import {
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
        let snap_failed = value.get("snapFailed") == Some(&Value::Bool(true));
        Ok(Some(Self { bitmap_count, imports, loads, graph_imports, snap_failed }))
    }

    /// Print the lines, as the loader does while merge runs.
    pub fn render_merge(&self, output: &Output) {
        for row in &self.imports {
            render_import(output, row);
        }
        for count in &self.loads {
            output.status(&format!("loading {count} component(s)"));
        }
        if !self.loads.is_empty() && !self.snap_failed {
            output.status("importing missing dependencies...");
            for row in &self.graph_imports {
                render_import(output, row);
            }
            output.status("adding dependencies graph...");
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

    /// Print the lines of `bit import` and `bit fetch` (`importer`): the
    /// latest heads, then the missing versions, which `importMany` fetches
    /// only when components are missing.
    pub fn render_inbound(&self, output: &Output, fetch: bool, with_ids: bool) {
        if fetch {
            output.status("fetching objects...");
        }
        output.status("importing components");
        if with_ids {
            output.status("importing components");
        }
        // `importMany` is called with the ids the latest-heads import requested.
        let requested = self.imports
            .iter()
            .find(|row| row.reason.as_deref() == Some(REASONS[0]));
        for row in &self.imports {
            if row.reason.as_deref() == Some(REASONS[1]) {
                output.status(&format!(
                    "import {} components with their dependencies (if missing)",
                    requested.unwrap_or(row).ids.len(),
                ));
                if row.components == 0 {
                    continue;
                }
            }
            render_import(output, row);
        }
    }

    /// Workspace lane fetch leaves the dependency result as its final loader
    /// status after the command-level success line.
    pub fn render_lane_fetch_tail(&self, output: &Output) {
        render_lane_tail(self.imports.last(), output);
    }

    pub fn render_lane_groups(
        &self,
        output: &Output,
        groups: &[usize],
        started: Instant,
    ) -> io::Result<()> {
        if groups.iter().sum::<usize>() != self.imports.len() {
            return Err(decline("native inbound lane groups"));
        }
        output.status("fetching objects...");
        let mut offset = 0;
        for &count in groups {
            output.status("importing components");
            output.status("importing components");
            for row in &self.imports[offset..offset + count] {
                render_import(output, row);
            }
            output.success("importing components", Some(started));
            render_lane_tail(self.imports[offset..offset + count].last(), output);
            offset += count;
        }
        Ok(())
    }

    /// Print the lines, as the loader does while checkout runs.
    pub fn render_checkout(&self, output: &Output) {
        self.render_checkout_with(output, false);
    }

    /// `checkout main` has already imported its target objects during the
    /// initial latest-on-main fetch; Harmony does not print the second import.
    pub fn render_checkout_with(&self, output: &Output, main: bool) {
        output.status("switching component version...");
        output.status("importing components");
        let started = Instant::now();
        let fetching = [REASONS[0], REASONS[1]];
        for row in self.imports
            .iter()
            .filter(|row| {
                row.reason
                    .as_deref()
                    .is_some_and(|reason| fetching.contains(&reason))
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
        output.success("importing components", Some(started));
        for row in self.imports
            .iter()
            .filter(|row| {
                !main && (row.reason.is_none() || row.reason.as_deref() == Some(REASONS[2]))
            })
        {
            render_import(output, row);
        }
    }
}

fn render_lane_tail(row: Option<&Import>, output: &Output) {
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
    if counts.len() != loads.len() || loads.len() > if snap { 5 } else { 4 } {
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
    Ok(Import { reason, ids, objects_only, components, objects })
}

/// `importReason`: the fixed reasons, and the lane and history templates.
fn known_reason(reason: &str) -> bool {
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
    text.split_once('/')
        .is_some_and(|(scope, name)| no_space(scope) && no_space(name) && !name.contains('/'))
}

/// `renderImport`.
fn render_import(output: &Output, row: &Import) {
    if row.ids.is_empty() {
        return;
    }
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
    let message = format!("importing {ids}{reason}");
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

/// `id.replace(/@[^@]+$/, '')`.
fn without_version(id: &str) -> &str {
    match id.rfind('@') {
        Some(index) if index + 1 < id.len() => &id[..index],
        _ => id,
    }
}

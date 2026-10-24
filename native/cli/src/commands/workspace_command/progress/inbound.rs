//! Import/fetch progress groups retain Node's main-first fetch order.
use super::{Import, Progress, REASONS, decline, render_import, render_lane_tail};
use bit_install::output::Output;
use std::{io, time::Instant};

impl Progress {
    /// Print the lines of `bit import` and `bit fetch` (`importer`): the
    /// latest heads, then the missing versions, which `importMany` fetches
    /// only when components are missing.
    pub fn render_inbound(
        &self,
        output: &Output,
        fetch: bool,
        with_ids: bool,
        wildcard: bool,
        prefetch: Option<usize>,
        on_lane: bool,
    ) {
        if fetch {
            output.status("fetching objects...");
        }
        if !on_lane {
            output.status("importing components");
        }
        if with_ids {
            output.status("importing components");
        }
        if let Some(count) = prefetch {
            output.restart(&format!("importing {count} components"));
            output.restart(&format!("successfully imported {count} components"));
        }
        self.render_inbound_rows(output, wildcard, on_lane);
    }

    /// A dependents graph phase already emitted the command's initial import statuses.
    pub(in crate::commands) fn render_inbound_continuation(&self, output: &Output, on_lane: bool) {
        self.render_inbound_rows(output, true, on_lane);
    }

    fn render_inbound_rows(&self, output: &Output, wildcard: bool, on_lane: bool) {
        // `importMany` is called with the ids the latest-heads import requested.
        render_rows(&self.imports, output, wildcard, on_lane);
    }

    /// Workspace lane fetch leaves the dependency result as its final loader
    /// status after the command-level success line.
    pub fn render_lane_fetch_tail(&self, output: &Output) {
        render_lane_tail(self.imports.last(), output);
    }

    pub fn render_fetch_groups(
        &self,
        output: &Output,
        groups: &[usize],
        main: bool,
        started: Instant,
    ) -> io::Result<()> {
        if groups.iter().sum::<usize>() != self.imports.len() {
            return Err(decline("native inbound lane groups"));
        }
        output.status("fetching objects...");
        let mut offset = 0;
        for (index, &count) in groups.iter().enumerate() {
            let rows = &self.imports[offset..offset + count];
            render_group(rows, output, main && index == 0, started);
            offset += count;
        }
        Ok(())
    }
}

fn render_rows(rows: &[Import], output: &Output, wildcard: bool, on_lane: bool) {
    let requested = rows.iter().find(|row| latest_request(row));
    for row in rows {
        if dependency_request(row) {
            output.status(&format!(
                "import {} components with their dependencies (if missing)",
                row.requested.unwrap_or_else(|| requested.unwrap_or(row).ids.len() as u64),
            ));
            if row.components == 0 && !((wildcard || on_lane) && row.objects > 0) {
                continue;
            }
        }
        render_import(output, row);
    }
}

fn render_group(rows: &[Import], output: &Output, main: bool, started: Instant) {
    if !main && let Some(name) = rows.iter().find_map(lane_name) {
        output.status(&format!("fetching lane {name}"));
    }
    output.status("importing components");
    render_rows(rows, output, true, !main);
    output.success("importing components", Some(started));
    if !main {
        render_lane_tail(rows.last(), output);
    }
}

fn lane_name(row: &Import) -> Option<&str> {
    row.reason
        .as_deref()?
        .strip_prefix("of their latest on lane ")?
        .split_once('/')
        .map(|(_, name)| name)
}

fn latest_request(row: &Import) -> bool {
    row.reason.as_deref() == Some(REASONS[0]) || lane_name(row).is_some()
}

fn dependency_request(row: &Import) -> bool {
    matches!(
        row.reason.as_deref(),
        Some("for getting missing versions and dependencies" | "for getting all dependencies"),
    )
}

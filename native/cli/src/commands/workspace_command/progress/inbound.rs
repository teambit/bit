//! Import/fetch progress groups retain Node's main-first fetch order.
//!
//! Extends [`Progress`] with [`Progress::render_inbound`] using [`render_import`] and [`render_lane_tail`].
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
        for enabled in [!on_lane, with_ids] {
            if enabled {
                output.status("importing components");
            }
        }
        if let Some(count) = prefetch {
            output.restart(&format!("importing {count} components"));
            output.restart(&format!("successfully imported {count} components"));
        }
        self.render_inbound_rows(output, wildcard, on_lane);
    }

    /// A dependents graph phase already emitted the command's initial import statuses.
    #[inline]
    pub(in crate::commands) fn render_inbound_continuation(&self, output: &Output, on_lane: bool) {
        self.render_inbound_rows(output, true, on_lane);
    }

    #[inline]
    fn render_inbound_rows(&self, output: &Output, wildcard: bool, on_lane: bool) {
        // `importMany` is called with the ids the latest-heads import requested.
        render_rows(&self.imports, output, wildcard, on_lane);
    }

    /// Workspace lane fetch leaves the dependency result as its final loader
    /// status after the command-level success line.
    #[inline]
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
        if groups
            .iter()
            .copied()
            .try_fold(0usize, usize::checked_add)
            != Some(self.imports.len())
        {
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
    let mut requested = rows.iter().find(|row| latest_request(row));
    for row in rows {
        if latest_request(row) {
            requested = Some(row);
        }
        if dependency_request(row)
            && !announce_dependency(row, requested, output, wildcard, on_lane)
        {
            continue;
        }
        render_import(output, row);
    }
}

fn announce_dependency(
    row: &Import,
    requested: Option<&Import>,
    output: &Output,
    wildcard: bool,
    on_lane: bool,
) -> bool {
    let count = row.requested.unwrap_or_else(|| {
        requested
            .unwrap_or(row)
            .ids
            .iter()
            .filter(|id| !id.trim().is_empty())
            .count() as u64
    });
    output.status(&format!("import {count} components with their dependencies (if missing)"));
    row.components > 0 || ((wildcard || on_lane) && row.objects > 0)
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

#[inline]
fn lane_name(row: &Import) -> Option<&str> {
    let raw = row.reason
        .as_deref()?
        .strip_prefix("of their latest on lane ")?
        .trim();
    raw.rsplit('/')
        .next()
        .map(str::trim)
        .filter(|name| !name.is_empty())
}

#[inline]
fn latest_request(row: &Import) -> bool {
    row.reason.as_deref().map(str::trim) == Some(REASONS[0]) || lane_name(row).is_some()
}

#[inline]
fn dependency_request(row: &Import) -> bool {
    matches!(
        row.reason.as_deref().map(str::trim),
        Some("for getting missing versions and dependencies" | "for getting all dependencies"),
    )
}

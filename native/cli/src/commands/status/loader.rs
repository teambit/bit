//! `StatusCmd.report` progress messages after status preflight.
//!
//! [`Progress`] and [`render`] flush buffered startup, load, and issue stdout around [`Output`] spinner phases.

use bit_install::output::Output;
use std::io;

/// Buffered stdout and imported object counts rendered around `StatusCmd.report` [`Output`] progress spinners.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Progress {
    pub(super) startup_stdout: String,
    pub(super) load_stdout: String,
    pub(super) issue_stdout: String,
    pub(super) main_count: usize,
    pub(super) main_objects: usize,
    pub(super) forked_count: usize,
    pub(super) forked_id: Option<String>,
}

/// Emits `fetching status`, component load counts, and lane import [`Progress`] messages onto `output` ([`Output`]) via [`render_loads`].
pub(super) fn render(
    output: &Output,
    loaded: usize,
    loads: usize,
    progress: &Progress,
) -> io::Result<()> {
    output.status("fetching status");
    render_loads(output, loaded, loads, progress);
    if progress.main_count > 0 {
        let reason = "main components of the current lane to check for updates";
        output.status(&format!("importing {} components {reason}", progress.main_count));
        let (imported, unit) = if progress.main_objects > 0 {
            (progress.main_objects, "objects")
        } else {
            (progress.main_count, "components")
        };
        output.status(&format!("successfully imported {imported} {unit} {reason}"));
    }
    if progress.forked_count > 0 {
        let reason = forked_lane_reason(progress.forked_id.as_deref());
        output.status(&format!("importing {} components {reason}", progress.forked_count));
        output.status(&format!("successfully imported {} objects {reason}", progress.forked_count));
    }
    Ok(())
}

/// Renders `loading <n> component(s)` spinner lines and flushes buffered load/issue stdout onto [`Output`].
#[inline]
fn render_loads(output: &Output, loaded: usize, loads: usize, progress: &Progress) {
    let mut printed_load_stdout = false;
    if loaded > 0 {
        for _ in 0..loads {
            output.status(&format!("loading {loaded} component(s)"));
            if !printed_load_stdout && !progress.load_stdout.is_empty() {
                output.raw(&progress.load_stdout);
                printed_load_stdout = true;
            }
        }
    }
    if !printed_load_stdout && !progress.load_stdout.is_empty() {
        output.raw(&progress.load_stdout);
    }
    if !progress.issue_stdout.is_empty() {
        output.raw(&progress.issue_stdout);
    }
}

/// Formats the spinner reason suffix (`"for fetching lane ..."`) for an optional `forked_id` in [`render`].
#[inline]
fn forked_lane_reason(forked_id: Option<&str>) -> String {
    let mut parts = forked_id
        .into_iter()
        .flat_map(|id| id.split('/'))
        .map(str::trim)
        .filter(|part| !part.is_empty());
    let Some(first) = parts.next() else {
        return "for fetching lane".to_owned();
    };
    let mut reason = format!("for fetching lane {first}");
    for part in parts {
        reason.push('/');
        reason.push_str(part);
    }
    reason
}

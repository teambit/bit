//! `StatusCmd.report` progress messages after status preflight.

use bit_install::output::Output;
use std::io;

#[derive(Default)]
pub(super) struct Progress {
    pub(super) startup_stdout: String,
    pub(super) load_stdout: String,
    pub(super) issue_stdout: String,
    pub(super) main_count: usize,
    pub(super) main_objects: usize,
    pub(super) forked_count: usize,
    pub(super) forked_id: Option<String>,
}

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
        if progress.main_objects > 0 {
            output.status(&format!(
                "successfully imported {} objects {reason}",
                progress.main_objects,
            ));
        } else {
            output.status(&format!(
                "successfully imported {} components {reason}",
                progress.main_count,
            ));
        }
    }
    if progress.forked_count > 0 {
        let reason = forked_lane_reason(progress.forked_id.as_deref());
        output.status(&format!("importing {} components {reason}", progress.forked_count));
        output.status(&format!("successfully imported {} objects {reason}", progress.forked_count));
    }
    Ok(())
}

fn render_loads(output: &Output, loaded: usize, loads: usize, progress: &Progress) {
    for index in 0..loads {
        output.status(&format!("loading {loaded} component(s)"));
        if index == 0 && !progress.load_stdout.is_empty() {
            output.raw(&progress.load_stdout);
        }
    }
    if loads == 0 && !progress.load_stdout.is_empty() {
        output.raw(&progress.load_stdout);
    }
    if !progress.issue_stdout.is_empty() {
        output.raw(&progress.issue_stdout);
    }
}

fn forked_lane_reason(forked_id: Option<&str>) -> String {
    match forked_id
        .map(str::trim)
        .filter(|id| !id.is_empty())
    {
        Some(id) => format!("for fetching lane {id}"),
        None => "for fetching lane".to_owned(),
    }
}

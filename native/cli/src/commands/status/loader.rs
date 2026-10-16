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
    for index in 0..loads {
        output.status(&format!("loading {loaded} component(s)"));
        if index == 0 {
            output.raw(&progress.load_stdout);
        }
    }
    if loads == 0 {
        output.raw(&progress.load_stdout);
    }
    output.raw(&progress.issue_stdout);
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
        let id = progress.forked_id.as_deref().unwrap_or_default();
        let reason = format!("for fetching lane {id}");
        output.status(&format!("importing {} components {reason}", progress.forked_count));
        output.status(&format!("successfully imported {} objects {reason}", progress.forked_count));
    }
    Ok(())
}

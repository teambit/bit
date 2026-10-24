//! The scope-install oracle masks only an exact optional startup timer sample.
#[path = "e2e/harmony/scope_rename/installation/startup_progress.rs"]
mod startup_progress;

const MARKER: &str = "- running package installation using pnpm\n\r\n\u{1b}[K\u{1b}[0J\r\u{1b}[1A";
const FRAME: &str =
    "Progress: resolved 1, reused 0, downloaded 0, added 0\n\u{1b}[K\u{1b}[0J\r\u{1b}[1A";
const BANNER: &str =
    "Packages are hard linked from the content-addressable store to the virtual store.\n";

#[test]
fn startup_timer_sample_projects_to_the_identical_banner_and_remaining_output() {
    let remaining = "  Content-addressable store is at: fixture\nPackages: +1\nProgress: resolved 1, reused 0, downloaded 0, added 1, done\n- compiling components\n";
    let expected = format!("prefix\n{MARKER}{BANNER}{remaining}");
    assert_eq!(startup_progress::project(&expected), expected);
    assert_eq!(
        startup_progress::project(&format!("prefix\n{MARKER}{FRAME}{BANNER}{remaining}")),
        expected,
    );
}

#[test]
fn changed_counters_controls_positions_and_duplicate_samples_remain_observable() {
    for text in [
        format!("{MARKER}{}{BANNER}", FRAME.replace("added 0", "added 1")),
        format!("{MARKER}{}{BANNER}", FRAME.replace("resolved 1", "resolved 2")),
        format!("{MARKER}{}{BANNER}", FRAME.replace("[1A", "[2A")),
        format!("{MARKER}{FRAME}{FRAME}{BANNER}"),
        format!("{MARKER}{FRAME}unexpected error\n{BANNER}"),
        format!("{FRAME}{MARKER}{BANNER}"),
        format!("{MARKER}{BANNER}{FRAME}"),
    ] {
        assert_eq!(startup_progress::project(&text), text);
    }
}

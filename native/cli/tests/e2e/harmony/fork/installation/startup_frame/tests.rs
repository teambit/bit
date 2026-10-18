use super::{BANNER, COUNTERS, REDRAW, START, project};
fn banner() -> String {
    format!(
        "{BANNER}  Content-addressable store is at: C:\\fixture\\store\\v11\u{1b}[0K\n  Virtual store is at:             node_modules/.pnpm\u{1b}[0K\n{COUNTERS}\u{1b}[0K\n\u{1b}[0K\u{1b}[K\u{1b}[0J\r\u{1b}[1APackages: +1\u{1b}[0K\n+\nProgress: resolved 1, reused 0, downloaded 0, added 1\n",
    )
}
#[test]
fn observed_redraw_and_no_redraw_preserve_the_identical_complete_banner_and_later_transition() {
    let expected = format!("unchanged prefix\n{START}{}", banner());
    let repeated = format!("unchanged prefix\n{START}{COUNTERS}{REDRAW}{}", banner());
    assert_eq!(project(&repeated), expected);
    assert_eq!(project(&expected), expected);
}
#[test]
fn changed_counts_control_bytes_stage_or_intervening_lines_are_never_removed() {
    let repeated = format!("{START}{COUNTERS}{REDRAW}{}", banner());
    for altered in [
        repeated.replacen("resolved 1", "resolved 2", 1),
        repeated.replacen("reused 0", "reused 1", 1),
        repeated.replacen("downloaded 0", "downloaded 1", 1),
        repeated.replacen("added 0", "added 1", 1),
        repeated.replacen(REDRAW, "\n\u{1b}[K\r\u{1b}[1A", 1),
        repeated.replacen("running package installation", "running other installation", 1),
        format!("embedded {repeated}"),
        repeated.replacen(BANNER, &format!("unexpected message\n{BANNER}"), 1),
        repeated.replacen(
            &format!("{COUNTERS}\u{1b}[0K"),
            "Progress: resolved 2, reused 0, downloaded 0, added 0\u{1b}[0K",
            1,
        ),
    ] {
        assert_eq!(project(&altered), altered);
    }
}
#[test]
fn a_later_duplicate_progress_transition_stays_byte_exact() {
    let text = format!("{START}{}{COUNTERS}{REDRAW}{COUNTERS}\n", banner());
    assert_eq!(project(&text), text);
}

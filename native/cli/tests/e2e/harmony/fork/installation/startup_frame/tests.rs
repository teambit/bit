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
    ] {
        assert_eq!(project(&altered), altered);
    }
}
#[test]
fn a_later_duplicate_progress_transition_stays_byte_exact() {
    let text = format!("{START}{}{COUNTERS}{REDRAW}{COUNTERS}\n", banner());
    assert_eq!(project(&text), text);
}

fn two_package_banner() -> String {
    banner()
        .replace("resolved 1", "resolved 2")
        .replace("Packages: +1", "Packages: +2")
        .replace("\n+\n", "\n++\n")
        .replace("added 1", "added 2")
}
#[test]
fn observed_two_package_redraw_preserves_the_banner_and_final_package_counts() {
    let expected = format!("unchanged prefix\n{START}{}", two_package_banner());
    let repeated =
        format!("unchanged prefix\n{START}{}{REDRAW}{}", super::TWO_COUNTERS, two_package_banner());
    assert_eq!(project(&repeated), expected);
    assert_eq!(project(&expected), expected);
    let changed_final = repeated.replace("added 2", "added 3");
    assert_ne!(project(&changed_final), expected);
    assert!(project(&changed_final).ends_with("added 3\n"));
}
#[test]
fn two_package_projection_rejects_counter_mismatches_and_unqualified_redraws() {
    let repeated = format!("{START}{}{REDRAW}{}", super::TWO_COUNTERS, two_package_banner());
    for altered in [
        repeated.replacen("reused 0", "reused 1", 1),
        repeated.replacen("downloaded 0", "downloaded 1", 1),
        repeated.replacen("added 0", "added 1", 1),
        repeated.replacen("resolved 2", "resolved 3", 2),
        repeated.replacen(REDRAW, "\n\u{1b}[K\r\u{1b}[1A", 1),
        repeated.replacen(BANNER, &format!("unexpected message\n{BANNER}"), 1),
        repeated.replacen(
            &format!("{}\u{1b}[0K", super::TWO_COUNTERS),
            &format!("{COUNTERS}\u{1b}[0K"),
            1,
        ),
    ] {
        assert_eq!(project(&altered), altered);
    }
}

#[test]
fn observed_one_to_two_resolution_frame_preserves_complete_banner_and_completion() {
    let expected = format!("unchanged prefix\n{START}{}", two_package_banner());
    let slow = format!("unchanged prefix\n{START}{COUNTERS}{REDRAW}{}", two_package_banner());
    assert_eq!(project(&slow), expected);
    assert_eq!(project(&expected), expected);
    for altered in [
        slow.replacen("resolved 2", "resolved 3", 1),
        slow.replacen("reused 0", "reused 1", 1),
        slow.replacen("downloaded 0", "downloaded 1", 1),
        slow.replacen("added 0", "added 1", 1),
    ] {
        assert_eq!(project(&altered), altered);
    }
    let changed_final = slow.replace("added 2", "added 3");
    assert_ne!(project(&changed_final), expected);
    assert!(project(&changed_final).ends_with("added 3\n"));
}

#[test]
fn released_unpadded_banner_preserves_paths_and_later_terminal_controls() {
    let padded = two_package_banner();
    let (banner, later) = padded.split_once("Packages: +2").unwrap();
    let plain = banner.replace("\u{1b}[0K", "");
    let expected = format!("{START}{plain}Packages: +2{later}");
    let slow = format!("{START}{COUNTERS}{REDRAW}{plain}Packages: +2{later}");
    assert_eq!(project(&slow), expected);
    assert_eq!(project(&expected), expected);
    let malformed = slow.replacen("node_modules/.pnpm", "node_modules/\u{1b}[1A.pnpm", 1);
    assert_eq!(project(&malformed), malformed);
}

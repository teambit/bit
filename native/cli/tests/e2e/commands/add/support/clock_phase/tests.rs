use super::{END, SECOND, START, delay, multiple_bitmap_writes};
#[test]
fn only_explicit_fork_and_recovery_operations_use_the_launch_gate() {
    for command in
        ["fork comp1 comp2", "scope fork old.scope target.scope -x", "recover scope/comp -x"]
    {
        assert!(multiple_bitmap_writes(command), "{command}");
    }
    for command in [
        "scope rename old new",
        "export",
        "checkout head",
        "forked comp1",
        "scope forked old",
        "recovered comp1",
    ] {
        assert!(!multiple_bitmap_writes(command), "{command}");
    }
}
#[test]
fn launch_window_is_inclusive_at_start_and_exclusive_at_end() {
    assert_eq!(delay(START), 0);
    assert_eq!(delay(END - 1), 0);
    assert_eq!(delay(START - 1), 1);
    assert_eq!(delay(END), SECOND - END + START);
    assert_eq!(delay(0), START);
    assert_eq!(delay(SECOND - 1), START + 1);
}

use super::valid_options;

#[test]
fn validates_completion_options() {
    assert!(valid_options(&[]));
    assert!(valid_options(&["--no-color"]));
    assert!(!valid_options(&["--unknown"]));
}

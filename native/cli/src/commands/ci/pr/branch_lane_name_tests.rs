use super::branch_lane_name;

/// Reserved default-lane names get a `-branch` suffix; other names are only sanitized.
#[test]
fn avoids_reserved_lane_names() {
    assert_eq!(branch_lane_name("master"), "master-branch");
    assert_eq!(branch_lane_name("Main"), "main-branch");
    assert_eq!(branch_lane_name("fix/master"), "fix-master");
    assert_eq!(branch_lane_name("main-fix"), "main-fix");
    assert_eq!(branch_lane_name("feature/New.Component"), "feature-new-component");
}

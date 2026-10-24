use super::parse;
use serde_json::json;

#[test]
fn policy_values_are_not_component_patterns() {
    let (policy, remaining) =
        parse(&["comp/*", "-i", "MissingDists, ParseErrors", "-I", "--no-lock-deps"], true)
            .unwrap();
    assert_eq!(remaining, ["comp/*"]);
    let mut options = json!({});
    policy.apply(&mut options);
    assert_eq!(options["policy"]["ignoreIssues"], "MissingDists, ParseErrors");
    assert_eq!(options["policy"]["ignoreNewestVersion"], true);
    assert_eq!(options["policy"]["noLockDeps"], true);
    assert!(parse(&["-i", "*", "--ignore-issues", "ParseErrors"], true).is_none());
    assert!(parse(&["-i", "--no-lock-deps"], true).is_none());
}

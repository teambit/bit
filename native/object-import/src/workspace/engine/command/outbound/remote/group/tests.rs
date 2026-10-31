use super::{name, parse};
use serde_json::json;
#[test]
fn matches_the_first_exact_group_and_preserves_zero_without_an_override() {
    let groups = "root:x:0:\nfoo-extra:x:42:\nfoo:x:43:\nfoo:x:44:";
    assert_eq!(parse(groups, "root").unwrap(), None);
    assert_eq!(parse(groups, "foo").unwrap(), Some(43));
    assert!(
        parse(groups, "missing")
            .unwrap_err()
            .to_string()
            .contains("the group does not exist"),
    );
    assert!(
        parse("foo:x:bad:", "foo")
            .unwrap_err()
            .to_string()
            .contains("parsing /etc/group"),
    );
}

#[test]
fn unsupported_truthy_configuration_declines_before_pending_objects() {
    for value in
        [json!({}), json!({"groupName":false}), json!({"groupName":0}), json!({"groupName":""})]
    {
        assert_eq!(name(&value).unwrap(), None);
    }
    assert_eq!(name(&json!({"groupName":"developers"})).unwrap(), Some("developers"));
    for value in [json!({"groupName":true}), json!({"groupName":42}), json!({"groupName":[]})] {
        assert!(name(&value).is_err());
    }
}

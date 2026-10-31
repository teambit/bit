//! `e2e/commands/pattern.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, parse};
use serde_json::json;

fn populate_three_components(helper: &Helper) {
    for index in 1..=3 {
        helper.output_file(
            &format!("comp{index}/index.js"),
            &format!("module.exports = () => 'comp{index}';"),
        );
        helper.native(&format!("add comp{index}"));
    }
}

/// general pattern matching › should match all components with **
/// general pattern matching › should match specific component by name
/// general pattern matching › should match components with comma-separated patterns
/// general pattern matching › should return JSON format when using --json flag
/// general pattern matching › should handle non-matching patterns gracefully
#[test]
fn general_pattern_matching() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    populate_three_components(&helper);

    let all = helper.native(r#"pattern "**""#);
    assert!(all.contains("comp1"), "{all}");
    assert!(all.contains("comp2"), "{all}");
    assert!(all.contains("comp3"), "{all}");
    assert!(all.contains("found 3 components"), "{all}");

    let single = helper.native("pattern comp1");
    assert!(single.contains("comp1"), "{single}");
    assert!(!single.contains("comp2"), "{single}");
    assert!(!single.contains("comp3"), "{single}");
    assert!(single.contains("found 1 component"), "{single}");

    let comma = helper.native(r#"pattern "**/comp1, **/comp3""#);
    assert!(comma.contains("comp1"), "{comma}");
    assert!(!comma.contains("comp2"), "{comma}");
    assert!(comma.contains("comp3"), "{comma}");
    assert!(comma.contains("found 2 components"), "{comma}");

    let json_out = parse(&helper.native(r#"pattern "**" --json"#));
    let items = json_out.as_array().unwrap();
    assert_eq!(items.len(), 3);
    let strings = items
        .iter()
        .map(|item| item.as_str().unwrap())
        .collect::<Vec<_>>();
    assert!(
        strings
            .iter()
            .any(|id| id.contains("comp1")),
        "{strings:?}",
    );
    assert!(
        strings
            .iter()
            .any(|id| id.contains("comp2")),
        "{strings:?}",
    );
    assert!(
        strings
            .iter()
            .any(|id| id.contains("comp3")),
        "{strings:?}",
    );

    let non_matching = helper.native_run("pattern non-existent-component");
    assert!(!non_matching.status.success());
}

/// pattern exclusion with negation (!) › basic exclusion patterns › should exclude comp1 when using pattern "**, !**/comp1"
/// pattern exclusion with negation (!) › full component ID exclusion › should exclude comp1 when using pattern with just "!scope-name/comp1"
/// pattern exclusion with negation (!) › full component ID exclusion › should exclude both components when using "!scope-name/comp1, !scope-name/comp2"
#[test]
fn pattern_exclusion_with_negation() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    for index in 1..=2 {
        helper.output_file(
            &format!("comp{index}/index.js"),
            &format!("module.exports = () => 'comp{index}';"),
        );
        helper.native(&format!("add comp{index}"));
    }
    let scope = &helper.scopes.remote;

    let basic = helper.native(r#"pattern "**, !**/comp1""#);
    assert!(!basic.contains("comp1"), "{basic}");
    assert!(basic.contains("comp2"), "{basic}");

    let single_negated = helper.native(&format!(r#"pattern "!{scope}/comp1""#));
    assert!(!single_negated.contains("comp1"), "{single_negated}");
    assert!(single_negated.contains("comp2"), "{single_negated}");
    assert!(single_negated.contains("found 1 component"), "{single_negated}");

    let both_negated = helper.native(&format!(r#"pattern "!{scope}/comp1, !{scope}/comp2""#));
    assert!(both_negated.contains("found 0 components"), "{both_negated}");
}

/// pattern with --remote flag › should list all components from remote scope with **
/// pattern with --remote flag › should support wildcard exclusion patterns from remote
/// pattern with --remote flag › should throw error when pattern does not include scope name
/// pattern with --remote flag › with multiple remote scopes › should list components from multiple remote scopes
#[test]
fn pattern_with_remote_flag() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("utils/is/string/string.js", FOO_FIXTURE);
    helper.output_file("utils/is/type/type.js", FOO_FIXTURE);
    helper.output_file("utils/fs/read/read.js", FOO_FIXTURE);
    helper.native(r#"add "utils/is/*" -n utils/is"#);
    helper.native(r#"add "utils/fs/*" -n utils/fs"#);
    helper.native("tag --unmodified");
    crate::helper::remote::publish(&helper);
    let scope = helper.scopes.remote.clone();

    let all = helper.native(&format!(r#"pattern "{scope}/**" --remote"#));
    assert!(all.contains("utils/is/string"), "{all}");
    assert!(all.contains("utils/is/type"), "{all}");
    assert!(all.contains("utils/fs/read"), "{all}");
    assert!(all.contains("found 3 components"), "{all}");

    let excluded = helper.native(&format!(r#"pattern "{scope}/**, !{scope}/utils/fs/*" --remote"#));
    assert!(excluded.contains("utils/is/string"), "{excluded}");
    assert!(excluded.contains("utils/is/type"), "{excluded}");
    assert!(!excluded.contains("utils/fs/read"), "{excluded}");
    assert!(excluded.contains("found 2 components"), "{excluded}");

    let invalid = helper.native_run("pattern invalid-pattern --remote");
    assert!(!invalid.status.success());
    let invalid_err = format!("{}{}", invalid.stdout, invalid.stderr);
    assert!(
        invalid_err.contains("when using --remote, the pattern must include the scope name"),
        "{invalid_err}",
    );

    let another_remote = format!("{scope}-remote2");
    let another_path = helper.scopes.e2e_dir.join(&another_remote);
    crate::helper::setup::copy_dir(
        &crate::helper::setup::shared().bare_scope_template,
        &another_path,
    );
    crate::helper::config::update_scope_json(&another_path.join("scope.json"), |json| {
        json.insert("name".into(), json!(another_remote));
    });
    helper.native(&format!("remote add file://{}", another_path.display()));
    helper.output_file("other/comp/comp.js", FOO_FIXTURE);
    crate::helper::config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/variants",
        json!({ "other/comp": { "defaultScope": another_remote } }),
    );
    helper.native("add other/comp");
    helper.native("tag --unmodified");
    helper.native("export");

    let multi =
        helper.native(&format!(r#"pattern "{scope}/utils/is/*, {another_remote}/**" --remote"#));
    assert!(multi.contains("utils/is/string"), "{multi}");
    assert!(multi.contains("utils/is/type"), "{multi}");
    assert!(multi.contains("comp"), "{multi}");
    assert!(multi.contains("found 3 components"), "{multi}");
}

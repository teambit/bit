//! `e2e/commands/tag.e2e.ts`.

mod lane;
mod registry;
mod root;
mod soft;
mod states;
mod unlinked;

/// Public semver and dependency behavior, with malformed-input delegations marked inline.
mod known_failures {
    use crate::{
        allow_known_failure,
        helper::{FOO_FIXTURE, Helper, Run, parse},
    };
    use serde_json::Value;
    use std::fs;

    /// `tagWithoutBuild(id, options)`, natively: something must be tagged.
    pub(super) fn tag(helper: &Helper, id: &str, options: &str) -> String {
        let output = helper.native(&format!("tag {id} {options}"));
        assert!(!output.contains("nothing to tag"), "{output}");
        output
    }

    /// The output of a failed run.
    fn failure(run: &Run) -> String {
        assert!(!run.status.success(), "succeeded:\n{}", run.stdout);
        format!("{}{}", run.stdout, run.stderr)
    }

    /// `createFile(folder, name)` with `fixtures.fooFixture`.
    pub(super) fn create_file(helper: &Helper, folder: &str, name: &str) {
        helper.output_file(&format!("{folder}/{name}"), FOO_FIXTURE);
    }

    /// tag component with invalid mainFile in bitmap › should not tag the component
    #[test]
    fn an_invalid_main_file_is_not_tagged() {
        let helper = Helper::new();
        helper.re_init_workspace();
        helper.create_component_bar_foo(FOO_FIXTURE);
        helper.add_component_bar_foo();
        let path = helper.scopes.local_path.join(".bitmap");
        let text = fs::read_to_string(&path).unwrap();
        let mut bitmap = parse(&text[text.find('{').unwrap()..]);
        bitmap["bar/foo"]["mainFile"] = Value::String(String::new());
        fs::write(&path, serde_json::to_string_pretty(&bitmap).unwrap()).unwrap();
        let output = failure(&allow_known_failure!(helper.native_or_known("tag bar/foo")));
        assert!(output.contains("error: main file") && output.contains("was removed"), "{output}");
    }

    /// `components/{patch,minor,major,exact}` tagged under the `components` namespace.
    pub(super) fn semver_workspace() -> Helper {
        let helper = Helper::new();
        helper.re_init_workspace_with(false);
        for name in ["patch", "minor", "major", "exact"] {
            create_file(&helper, &format!("components/{name}"), &format!("{name}.js"));
        }
        helper.run("add components/* -n components");
        helper.tag_without_build("", "");
        helper
    }

    /// The entry of `id` in `bit list --local-scope --json`.
    pub(super) fn listed(list: &Value, id: &str) -> Value {
        let entry = list
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["id"] == id);
        entry
            .unwrap_or_else(|| panic!("{id} in {list}"))
            .clone()
    }

    /// semver flags › tag specific component › Should throw error when the version already
    /// exists
    #[test]
    fn an_existing_version_is_not_tagged_again() {
        let helper = semver_workspace();
        tag(&helper, "components/exact --ver 5.5.5", "--unmodified");
        let output = failure(&allow_known_failure!(helper.native_or_known(
            "tag components/exact --ver 5.5.5 --unmodified"
        )));
        let expected = "error: version 5.5.5 already exists for my-scope/components/exact";
        assert!(output.contains(expected), "{output}");
    }

    /// with removed file/files › Should not let you tag with a non-existing dependency
    #[test]
    fn a_missing_dependency_file_blocks_the_tag() {
        let helper = Helper::new();
        helper.re_init_workspace();
        helper.create_component_bar_foo(FOO_FIXTURE);
        create_file(&helper, "bar", "index.js");
        helper.run("add bar -i bar/foo");
        helper.output_file("bar/foo.js", "");
        helper.output_file("bar/index.js", r#"var foo = require("./foo.js")"#);
        helper.run("add bar/ -i bar/foo");
        helper.delete_path("bar/foo.js");
        let output = failure(&allow_known_failure!(helper.native_or_known("tag")));
        let expected = "error: issues found with the following components";
        assert!(output.contains(expected), "{output}");
        let list = helper.run("list --local-scope");
        assert!(!list.contains("bar/foo"), "{list}");
    }

    /// tag a component without its dependencies › should show a descriptive error message
    #[test]
    fn a_dependency_left_out_of_the_tag_is_explained() {
        let helper = Helper::new();
        helper.re_init_workspace();
        helper.populate_components(2, true, "");
        let run = allow_known_failure!(helper.native_or_known("tag comp1"));
        let output = format!("{}{}", run.stdout, run.stderr);
        let expected = "this dependency was not included in the tag command";
        assert!(output.contains(expected), "{output}");
    }

    /// tag component with auto-tag should validate component issues › should throw an error
    /// about component issues, not about relativePaths in Version object
    #[test]
    fn an_auto_tagged_dependent_is_validated() {
        let helper = Helper::new();
        helper.re_init_workspace();
        helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
        helper.output_file("comp2/index.js", "module.exports = () => 'comp2';");
        helper.run("add comp1");
        helper.run("add comp2");
        helper.tag_without_build("", "");
        let relative =
            "const comp2 = require('../comp2');\nmodule.exports = () => 'comp1 and ' + comp2();";
        helper.output_file("comp1/index.js", relative);
        let output =
            failure(&allow_known_failure!(helper.native_or_known("tag comp2 --unmodified")));
        assert!(output.contains("issues found") && output.contains("relative import"), "{output}");
        assert!(!output.contains("unable to save Version object"), "{output}");
        assert!(!output.contains("should not have relativePaths"), "{output}");
    }
    #[test]
    fn invalid_semver_is_rejected() {
        let helper = semver_workspace();
        create_file(&helper, "components/default", "default.js");
        helper.run("add components/default -i components/default");
        let output = failure(&allow_known_failure!(helper.native_or_known(
            "tag components/default --ver invalidVersion"
        )));
        let invalid = "error: version invalidVersion is not a valid semantic version. learn more: https://semver.org";
        assert!(output.contains(invalid), "{output}");
    }
}

mod qualification {
    use super::known_failures::{create_file, listed, semver_workspace, tag};
    use crate::helper::{Helper, parse};
    #[test]
    fn release_type_flags_bump_the_version() {
        let helper = semver_workspace();
        create_file(&helper, "components/default", "default.js");
        helper.run("add components/default -i components/default");
        let bumps = [
            ("components/default", "", "components/default@0.0.1"),
            ("components/patch", "--patch", "components/patch@0.0.2"),
            ("components/minor", "--minor", "components/minor@0.1.0"),
            ("components/major", "--major", "components/major@1.0.0"),
        ];
        for (id, flag, expected) in bumps {
            let output = tag(&helper, id, &format!("--unmodified {flag}"));
            assert!(output.contains(expected), "{expected} in {output}");
        }
    }

    #[test]
    fn an_exact_version_tags_a_new_component() {
        let helper = semver_workspace();
        create_file(&helper, "components/exact2", "exact-new.js");
        helper.run("add components/exact2 -i components/exact-new");
        let output = tag(&helper, "components/exact-new@5.12.10", "--unmodified");
        assert!(output.contains("components/exact-new@5.12.10"), "{output}");
    }

    #[test]
    fn a_dependent_gets_a_patch_bump() {
        let helper = semver_workspace();
        create_file(&helper, "components/dependency", "dependency.js");
        helper.output_file(
            "components/dependent/dependent.js",
            "import foo from '../dependency/dependency'",
        );
        helper.run("add components/dependency components/dependent -n components");
        helper.run("link --rewire");
        helper.tag_without_build("", "");
        tag(&helper, "components/dependency", "--unmodified --major");
        let list = parse(&helper.run("list --local-scope --json"));
        for (id, version) in [("dependency", "1.0.0"), ("dependent", "0.0.2")] {
            let entry = listed(&list, &format!("my-scope/components/{id}"));
            assert_eq!(entry["localVersion"], version, "{entry}");
            assert_eq!(entry["currentVersion"], version, "{entry}");
            assert_eq!(entry["deprecated"], false, "{entry}");
            assert_eq!(entry["remoteVersion"], "N/A", "{entry}");
        }
    }

    #[test]
    fn windows_line_endings_are_stored_as_linux() {
        let helper = Helper::new();
        helper.re_init_workspace();
        helper.create_component_bar_foo("hello\r\n world\r\n");
        helper.add_component_bar_foo();
        tag(&helper, "bar/foo", "");
        let component = parse(&helper.run("cat-component bar/foo@latest --json"));
        let hash = component["files"][0]["file"]
            .as_str()
            .unwrap()
            .to_string();
        let content = helper.run(&format!("cat-object {hash} -s"));
        assert!(content.contains(r#""hello\n world\n""#), "{content}");
    }

    #[test]
    fn an_empty_message_tags() {
        let helper = Helper::new();
        helper.re_init_workspace();
        helper.populate_components(1, false, "");
        tag(&helper, "", r#"-m """#);
    }

    #[test]
    fn a_new_dependent_is_counted_once() {
        let helper = Helper::new();
        helper.re_init_workspace();
        helper.output_file("components/comp1/comp1.js", "module.exports = { test: true };");
        helper.run("add components/comp1 -i components/comp1");
        helper.tag_without_build("", "");
        let modified = "module.exports = { test: true, modified: true };";
        helper.output_file("components/comp1/comp1.js", modified);
        let requires = "const comp1 = require('../comp1/comp1');";
        helper.output_file("components/comp2/comp2.js", requires);
        helper.run("add components/comp2 -i components/comp2");
        helper.run("link --rewire");
        let output = tag(&helper, "", "");
        assert!(output.contains("2 component(s) tagged"), "{output}");
        assert!(!output.contains("3 component(s) tagged"), "{output}");
    }
}

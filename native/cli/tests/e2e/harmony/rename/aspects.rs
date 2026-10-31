use crate::{
    commands::move_paths::support::{self, bitmap, setup, successful},
    helper::{Helper, remote},
};
use std::fs;
fn workspace(exported: bool) -> Helper {
    let helper = support::workspace(0, false);
    let directory = format!("{}/my-aspect", helper.scopes.remote);
    helper.output_file(
        &format!("{directory}/index.ts"),
        "export { MyAspectAspect } from './my-aspect.aspect';\n",
    );
    helper.output_file(&format!("{directory}/my-aspect.aspect.ts"), &format!(
        "import {{ Aspect }} from '@teambit/harmony'; export const MyAspectAspect = Aspect.create({{id:'{}/my-aspect'}});\n", helper.scopes.remote,
    ));
    setup(&helper, &format!("add {directory} -i my-aspect"));
    setup(&helper, "env set my-aspect teambit.harmony/aspect");
    super::lanes::delay_new(&helper, &format!("{}/foo", helper.scopes.remote));
    if exported {
        support::tag(&helper);
        remote::publish_selected(
            &helper,
            &[
                format!("{}/my-aspect", helper.scopes.remote),
                format!("{}/env/lane-delay", helper.scopes.remote),
            ],
        );
    }
    helper
}
#[test]
fn new_aspect_rename_changes_directory_filenames_and_classes_unless_preserved() {
    for (flag, directory, class, old_directory, old_class) in [
        ("", "foo", "FooAspect", "my-aspect", "MyAspectAspect"),
        ("--preserve", "my-aspect", "MyAspectAspect", "foo", "FooAspect"),
    ] {
        let helper = workspace(false);
        successful(&helper, &format!("rename my-aspect foo {flag}"));
        let path = helper.scopes.local_path.join(&helper.scopes.remote).join(directory);
        assert!(path.is_dir());
        let text = fs::read_to_string(path.join(format!("{directory}.aspect.ts"))).unwrap();
        assert!(text.contains(class));
        assert!(!text.contains(old_class));
        assert!(
            !path
                .join(format!("{old_directory}.aspect.ts"))
                .exists(),
        );
        assert_eq!(
            bitmap(&helper)["foo"]["rootDir"],
            format!("{}/{directory}", helper.scopes.remote),
        );
    }
}
#[test]
fn exported_aspect_rename_changes_only_the_new_component_sources() {
    let helper = workspace(true);
    successful(&helper, "rename my-aspect foo --deprecate");
    let root = helper.scopes.local_path.join(&helper.scopes.remote);
    let renamed = fs::read_to_string(root.join("foo/foo.aspect.ts")).unwrap();
    assert!(renamed.contains("FooAspect"));
    assert!(!renamed.contains("MyAspectAspect"));
    assert!(!root.join("foo/my-aspect.aspect.ts").exists());
    let original = fs::read_to_string(root.join("my-aspect/my-aspect.aspect.ts")).unwrap();
    assert!(original.contains("MyAspectAspect"));
    assert!(!original.contains("FooAspect"));
}

#[test]
fn ast_rename_transforms_types_identifiers_and_module_paths_but_preserves_literal_text() {
    let helper = support::workspace(0, false);
    helper.output_file(
        "old-widget/index.ts",
        r"import { OldWidgetProps } from './old-widget.types';
export { OldWidgetProps } from './old-widget.types';
export const oldWidgetText = 'old-widget literal OldWidget oldWidget';
export interface OldWidgetOptions { value: OldWidgetProps; }
export type OldWidgetValue = OldWidgetProps;
export class OldWidget { value: OldWidgetOptions; }
export function oldWidgetFactory(): OldWidget { return new OldWidget(); }
",
    );
    helper.output_file(
        "old-widget/old-widget.types.ts",
        "export interface OldWidgetProps { enabled: boolean; }\n",
    );
    setup(&helper, "add old-widget -i old-widget");
    super::lanes::delay_new(&helper, &format!("{}/new-widget", helper.scopes.remote));
    successful(&helper, "rename old-widget new-widget --ast");
    let map = bitmap(&helper);
    let root = helper.scopes.local_path.join(map["new-widget"]["rootDir"].as_str().unwrap());
    assert!(root.join("new-widget.types.ts").is_file());
    assert!(!root.join("old-widget.types.ts").exists());
    let text = fs::read_to_string(root.join("index.ts")).unwrap();
    for expected in [
        "./new-widget.types",
        "NewWidgetProps",
        "NewWidgetOptions",
        "NewWidgetValue",
        "class NewWidget",
        "function newWidget()",
        "newWidgetText",
        "old-widget literal OldWidget oldWidget",
    ] {
        assert!(text.contains(expected), "missing {expected}: {text}");
    }
}

#[test]
fn renaming_to_the_same_name_and_scope_preserves_the_released_error_and_state() {
    let helper = support::workspace(1, false);
    let result = support::compare(&helper, "rename comp1 comp1");
    assert!(!result.status.success());
    assert!(bitmap(&helper).get("comp1").is_some());
}

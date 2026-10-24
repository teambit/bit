//! `e2e/harmony/track-directories-harmony.e2e.ts`.

use crate::helper::{Helper, parse};
use serde_json::json;

/// - `track directories functionality › add a directory as authored › should add the directory as rootDir in bitmap file`
/// - `track directories functionality › add a directory as authored › creating another file in the same directory › bit status should still show the component as new`
/// - `track directories functionality › add a directory as authored › creating another file in the same directory › should add the new file`
/// - `track directories functionality › add a directory as authored › creating another file in the same directory › rename a non-main file › should update the renamed file`
/// - `track directories functionality › add a directory as authored › creating another file in the same directory and running bit-status from an inner directory › bit status should still show the component as new`
/// - `track directories functionality › add a directory as authored › creating another file in the same directory and running bit-status from an inner directory › bit status should update bitmap and add the new file`
/// - `track directories functionality › add a directory as authored › rename the file which is a main file › bit status should indicate the missing of the mainFile`
/// - `track directories functionality › add a directory as authored › tagging the component › should save the files with relativePaths relative to the rootDir`
/// - `track directories functionality › add a directory as authored › tagging the component › then adding a new file to the directory › bit status should show the component as modified`
/// - `track directories functionality › add a directory as authored › tagging the component › then adding a new file to the directory › bit status should update bitmap and add the new file`
/// - `track directories functionality › add a directory as authored › adding a file outside of that directory › should throw an error`
/// - `track directories functionality › add a directory as authored › adding a parent directory › should add the files in that directory successfully`
/// - `track directories functionality › add a directory as authored › adding a parent directory › should change the rootDir to the newly added dir`
/// - `track directories functionality › add a directory as authored › adding a parent directory › should change the files according to the new rootDir`
/// - `track directories functionality › add a directory as authored › importing the component › should not change the rootDir`
/// - `track directories functionality › add multiple directories › should add rootDir property for each one of the directories`
/// - `track directories functionality › adding files to sub-directories › the files on the sub-dir should be auto-tracked`
#[test]
fn track_directories_functionality() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("utils/bar/foo.js", "module.exports = () => 'foo';");
    helper.native("add utils/bar -i utils/bar");
    let local_scope = helper.clone_workspace();

    let bm = helper.read_bit_map();
    assert_eq!(bm["utils/bar"]["rootDir"], json!("utils/bar"));
    assert!(bm["utils/bar"].get("trackDir").is_none());

    // 1. Creating another file in the same directory and renaming a non-main file
    helper.output_file("utils/bar/foo2.js", "module.exports = () => 'foo2';");
    let status_out = helper.native("status");
    assert!(status_out.contains("new components"), "{status_out}");
    let files1 = helper.get_component_files("utils/bar");
    assert!(files1.contains(&"foo.js".to_owned()));
    assert!(files1.contains(&"foo2.js".to_owned()));

    helper.move_sync("utils/bar/foo2.js", "utils/bar/foo3.js");
    helper.native("status");
    let files2 = helper.get_component_files("utils/bar");
    assert!(files2.contains(&"foo.js".to_owned()));
    assert!(!files2.contains(&"foo2.js".to_owned()));
    assert!(files2.contains(&"foo3.js".to_owned()));
    assert_eq!(files2.len(), 2);

    // 2. Running bit status from an inner directory
    helper.get_cloned_workspace(&local_scope);
    helper.output_file("utils/bar/foo2.js", "module.exports = () => 'foo2';");
    let inner_run = Helper::cmd_in(&helper.scopes.local_path.join("utils"), "status");
    assert!(inner_run.native && inner_run.status.success());
    assert!(inner_run.stdout.contains("new components"));
    let files_inner = helper.get_component_files("utils/bar");
    assert!(files_inner.contains(&"foo.js".to_owned()));
    assert!(files_inner.contains(&"foo2.js".to_owned()));

    // 3. Rename the main file
    helper.get_cloned_workspace(&local_scope);
    helper.move_sync("utils/bar/foo.js", "utils/bar/foo2.js");
    let status_missing_main = helper.native("status");
    assert!(status_missing_main.contains("main-file was removed"), "{status_missing_main}");

    // 4. Tagging the component then adding a new file
    helper.get_cloned_workspace(&local_scope);
    helper.native("tag --skip-tests");
    let cat_bar = parse(&helper.native("cat-component utils/bar@latest --json"));
    assert_eq!(cat_bar["files"][0]["relativePath"], json!("foo.js"));
    assert_eq!(cat_bar["mainFile"], json!("foo.js"));

    helper.output_file("utils/bar/foo2.js", "module.exports = () => 'foo2';");
    let status_mod = helper.native("status");
    assert!(status_mod.contains("modified components"), "{status_mod}");
    let files_mod = helper.get_component_files("utils/bar@0.0.1");
    assert!(files_mod.contains(&"foo.js".to_owned()));
    assert!(files_mod.contains(&"foo2.js".to_owned()));

    // 5. Adding an individual file throws AddingIndividualFiles
    helper.get_cloned_workspace(&local_scope);
    helper.output_file("utils/a.js", "");
    let err_add = helper.native_run("add utils/a.js -i utils/bar");
    assert_ne!(err_add.status.code(), Some(0));

    // 6. Adding a parent directory updates rootDir
    helper.get_cloned_workspace(&local_scope);
    helper.output_file("utils/qux/qux.js", "");
    let parent_out = helper.native("add utils --id utils/bar");
    assert!(parent_out.replace('\\', "/").contains("added qux/qux.js"), "{parent_out}");
    let bm_parent = helper.read_bit_map();
    assert_eq!(bm_parent["utils/bar"]["rootDir"], json!("utils"));
    let files_parent = helper.get_component_files("utils/bar");
    assert!(
        files_parent
            .iter()
            .any(|file| file.replace('\\', "/") == "bar/foo.js"),
    );

    // 7. Importing the component preserves rootDir
    helper.get_cloned_workspace(&local_scope);
    helper.add_remote_scope();
    let remote = helper.scopes.remote.clone();
    helper.add_default_scope(&remote);
    helper.native("tag --skip-tests");
    helper.native("export");
    helper.run(&format!("import {remote}/utils/bar -x"));
    let bm_imported = helper.read_bit_map();
    let bar_row = bm_imported
        .get("utils/bar")
        .or_else(|| bm_imported.get("utils/bar@0.0.1"))
        .unwrap();
    assert_eq!(bar_row["rootDir"], json!("utils/bar"));

    // 8. Add multiple directories and files in sub-directories
    helper.re_init_workspace();
    helper.output_file("utils/foo/index.js", "");
    helper.output_file("utils/bar/index.js", "");
    helper.output_file("utils/baz/index.js", "");
    helper.native(r#"add "utils/*" -n utils"#);
    let bm_multi = helper.read_bit_map();
    assert_eq!(bm_multi["utils/foo"]["rootDir"], json!("utils/foo"));
    assert_eq!(bm_multi["utils/bar"]["rootDir"], json!("utils/bar"));
    assert_eq!(bm_multi["utils/baz"]["rootDir"], json!("utils/baz"));

    helper.re_init_workspace();
    helper.output_file("bar/foo.ts", "");
    helper.native("add bar");
    helper.output_file("bar/baz/index.ts", "");
    helper.native("status");
    helper.output_file("bar/baz/baz.ts", "");
    helper.native("status");
    let files_sub = helper.get_component_files("bar");
    assert!(
        files_sub
            .iter()
            .any(|file| file.replace('\\', "/") == "baz/baz.ts"),
    );
}

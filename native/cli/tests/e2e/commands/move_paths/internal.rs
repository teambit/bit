//! Internal path relocation uses the component's complete retained ignore policy.
use super::support::{bitmap, compare, setup, workspace};
use std::fs;

#[test]
fn nested_directory_moves_ignored_bytes_but_reports_only_tracked_files() {
    let helper = workspace(0, false);
    helper.output_file("comp1/nested/main.js", "module.exports=1;\n");
    helper.output_file("comp1/nested/z.js", "module.exports=2;\n");
    helper.output_file("comp1/nested/deeper/a.js", "module.exports=3;\n");
    helper.output_file("comp1/nested/ignored.txt", "ignored bytes\n");
    helper.output_file("comp1/.bitignore", "**/ignored.txt\n");
    setup(&helper, "add comp1 -i comp1 -m comp1/nested/main.js");
    let output = compare(&helper, "move comp1/nested comp1/other");
    if cfg!(windows) {
        assert!(!output.status.success());
        assert!(output.stderr.contains("is not a tracked component"));
        assert!(helper.scopes.local_path.join("comp1/nested/ignored.txt").is_file());
        assert!(!helper.scopes.local_path.join("comp1/other").exists());
        return;
    }
    assert!(output.status.success(), "{}", output.stderr);
    assert!(!output.stdout.contains("ignored.txt"));
    assert!(output.stdout.contains("nested/main.js"));
    assert_eq!(bitmap(&helper)["comp1"]["mainFile"], "other/main.js");
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join("comp1/other/ignored.txt")).unwrap(),
        "ignored bytes\n",
    );
    assert!(!helper.scopes.local_path.join("comp1/nested").exists());
}

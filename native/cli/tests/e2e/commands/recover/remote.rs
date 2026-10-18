//! Scope.get imports missing models before the separate nonpersisting remote peek.
use crate::{
    commands::move_paths::support::{setup, workspace},
    helper::remote,
};
use std::fs;

#[test]
fn undeleted_remote_component_keeps_scope_import_prefix_without_tracking() {
    let helper = workspace(1, true);
    remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    let result = crate::commands::add::support::compare_with_stdout(
        &helper,
        &format!("recover {}/comp1 -x", helper.scopes.remote),
        stable,
    );
    assert!(!result.status.success());
    assert!(result.stderr.contains("no soft-deleted components found"));
    assert!(!helper.scopes.local_path.join("comp1").exists());
}

#[test]
fn deleted_remote_component_is_imported_then_its_removal_is_overridden() {
    let helper = workspace(1, true);
    remote::publish(&helper);
    setup(&helper, "delete comp1 --silent");
    setup(&helper, "tag comp1 --ignore-issues * --message removed");
    remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    let id = format!("{}/comp1", helper.scopes.remote);
    let result = crate::commands::add::support::compare_with_stdout(
        &helper,
        &format!("recover {id} -x --skip-write-config-files"),
        stable,
    );
    assert!(result.status.success(), "{}", result.stderr);
    let map = crate::commands::move_paths::support::bitmap(&helper);
    let row = map
        .as_object()
        .unwrap()
        .values()
        .find(|row| row["name"] == "comp1")
        .unwrap();
    assert_eq!(row["config"]["teambit.component/remove"]["removed"], false);
    let directory = row["rootDir"].as_str().unwrap();
    let expected = if cfg!(windows) {
        "module.exports=()=> 'comp1';\r\n"
    } else {
        "module.exports=()=> 'comp1';\n"
    };
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join(directory).join("index.js")).unwrap(),
        expected,
    );
}

// Import work is measured independently by each real process. Preserve every
// completion line and byte except its validated pretty-time numeric token.
pub(super) fn stable(text: &str) -> String {
    text.split_inclusive('\n')
        .fold(String::new(), |mut output, line| {
            let (body, newline) = line
                .strip_suffix('\n')
                .map_or((line, ""), |line| (line, "\n"));
            let Some(duration) = body.strip_prefix("✔ importing components (completed in ")
            else {
                output.push_str(line);
                return output;
            };
            let duration = duration.strip_suffix(')').expect("canonical import completion suffix");
            let digits = duration
                .bytes()
                .take_while(u8::is_ascii_digit)
                .count();
            assert!(
                digits > 0
                    && ["ns", "μs", "µs", "ms", "s", "m", "h"].contains(&&duration[digits..]),
                "invalid import duration: {duration}",
            );
            output.push_str("✔ importing components (completed in <duration>)");
            output.push_str(newline);
            output
        })
}

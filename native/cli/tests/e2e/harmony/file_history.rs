//! Published file-history readers retain the tagged source after deprecation is staged.

use crate::commands::move_paths::support::{self, bitmap, compare};

#[test]
fn log_file_loads_multiple_versions_with_exact_published_cache() {
    let helper = support::workspace(1, true);
    helper.append_file("comp1/index.js", "\n// second tagged version\n");
    support::tag(&helper);
    let result = compare(&helper, "log-file comp1/index.js");
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    assert!(result.stdout.contains("tag 0.0.1"));
    assert!(result.stdout.contains("tag 0.0.2"));
}

#[test]
fn log_file_loads_tagged_history_with_exact_published_cache() {
    let helper = support::workspace(1, true);
    let result = compare(&helper, "log-file comp1/index.js");
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
}

#[test]
fn log_file_reads_staged_deprecation_with_exact_published_state() {
    let helper = support::workspace(1, true);
    support::setup(&helper, "deprecate comp1");
    assert!(bitmap(&helper)["comp1"]["config"]["teambit.component/deprecation"].is_object());
    let result = compare(&helper, "log-file comp1/index.js");
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
}

#[test]
fn blame_reads_staged_deprecation_with_exact_published_state() {
    let helper = support::workspace(1, true);
    support::setup(&helper, "deprecate comp1");
    assert!(bitmap(&helper)["comp1"]["config"]["teambit.component/deprecation"].is_object());
    let result = compare(&helper, "blame comp1/index.js");
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
}

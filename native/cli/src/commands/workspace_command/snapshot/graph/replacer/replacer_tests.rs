//! Unit tests for replacing `file:` [`WorkspaceComponent`] dependency specifiers with component versions in [`Replacer`] snapshots.
//!
//! Verifies [`replacer`] regex matching across peer dependency suffixes and `0.0.0-<hash>` snap versions.

use super::{Replacer, WorkspaceComponent};

/// Builds a test [`Replacer`] fixture with snapped and tagged [`WorkspaceComponent`] entries.
fn replacer() -> Replacer {
    Replacer::new(&[
        WorkspaceComponent {
            package_name: "@s/one",
            identity: "s/one",
            version: Some("0123456789abcdef0123456789abcdef01234567"),
        },
        WorkspaceComponent { package_name: "@s/a.b", identity: "s/a.b", version: Some("1.0.0") },
    ])
    .unwrap()
}

/// Verifies that [`Replacer::replace`] rewrites `@scope/pkg@file:...` specifiers to component versions and preserves registry packages.
///
/// Also checks [`Replacer::component`] lookup for known workspace package names.
#[test]
fn file_versions_become_component_versions() {
    let replacer = replacer();
    assert_eq!(replacer.replace("@s/a.b@file:comps/ab"), "@s/a.b@1.0.0");
    // `[^'"(]+` runs over the closing parenthesis, as in Node.
    assert_eq!(
        replacer.replace("x@1.0.0(@s/one@file:comps/one)(@s/a.b@file:comps/ab)"),
        "x@1.0.0(@s/one@0.0.0-0123456789abcdef0123456789abcdef01234567(@s/a.b@1.0.0",
    );
    assert_eq!(
        replacer.replace("@s/aXb@file:comps/ab"),
        "@s/aXb@file:comps/ab",
        "dots are escaped",
    );
    assert_eq!(replacer.replace("lodash@4.0.0"), "lodash@4.0.0");
    assert_eq!(replacer.component("@s/a.b"), Some(&("a.b".to_string(), "s".to_string())));
    assert_eq!(replacer.component("lodash"), None);
}

/// Verifies that [`Replacer`] rewrites a versionless [`WorkspaceComponent`] (`version: None`) to `@undefined`.
///
/// Matches `snapToSemver(undefined)` behavior for unsnapped workspace components.
#[test]
fn a_new_component_is_named_like_snap_to_semver_of_undefined() {
    let components =
        [WorkspaceComponent { package_name: "@s/new", identity: "s/new", version: None }];
    let replacer = Replacer::new(&components).unwrap();
    assert_eq!(replacer.replace("@s/new@file:comps/new"), "@s/new@undefined");
}

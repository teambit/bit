//! Unit tests for incoming added component [`capture`] validation ([`incoming_capture_never_invents_current_contents_or_version`]) in `bit-object-import`.
//!
//! Ensures newly added components start with empty current contents and relative root directories.
//!
//! Also rejects mismatched component identities and invalid root directory paths.

use super::{capture, json};
/// Verifies that [`capture`] initializes newly added components (`added: true`, `scope/new`) with empty files and version while rejecting invalid or traversal `rootDir` paths ([`json`]).
#[test]
fn incoming_capture_never_invents_current_contents_or_version() {
    let destination =
        json!({"scope":"scope","name":"new","rootDir":"components/new","version":"a".repeat(40)});
    let current = capture("scope/new", &destination).unwrap();
    assert!(current.added);
    assert!(!current.hidden);
    assert_eq!(current.target.version, "");
    assert_eq!(current.target.current, json!({}));
    assert_eq!(current.files, json!([]));
    assert_eq!(current.target.directory, "components/new");
    assert!(capture("scope/different", &destination).is_err());
    for path in [".", "../outside", "/absolute", ""] {
        let mut bad = destination.clone();
        bad["rootDir"] = json!(path);
        assert!(capture("scope/new", &bad).is_err());
    }
}

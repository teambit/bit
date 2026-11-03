//! Unit tests for platform separator behavior in implicit tracked lane selection via [`tracked_for_separator`] ([`Scratch`], [`SEQUENCE`]) in `bit-object-import`.
//!
//! Ensures implicit remote lane discovery normalizes path separators across platforms and remote ref directories.

use super::tracked_for_separator;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

/// Monotonic sequence counter for unique [`Scratch`] directory names.
static SEQUENCE: AtomicUsize = AtomicUsize::new(0);

/// Temporary workspace fixture seeded with `.bit/refs/remotes/scope` lane refs.
#[derive(Debug)]
struct Scratch(PathBuf);
impl Scratch {
    fn new() -> Self {
        let root = std::env::temp_dir()
            .join(format!(
                "bit-implicit-lane-glob-{}-{}",
                std::process::id(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed),
            ));
        let scope = root.join(".bit/refs/remotes/scope");
        fs::create_dir_all(&scope).unwrap();
        for name in ["dev", "zeta", "main", "master"] {
            fs::write(scope.join(name), b"[]").unwrap();
        }
        Self(root)
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

/// Verifies that [`tracked_for_separator`] returns non-`main`/`master` remote lane refs in [`Scratch`] when `/` is the path separator ([`SEQUENCE`], [`Ordering`]).
#[test]
fn implicit_lane_selection_matches_published_path_separator_glob_behavior() {
    let scratch = Scratch::new();
    assert_eq!(tracked_for_separator(&scratch.0, '/').unwrap(), ["scope/zeta", "scope/dev"]);
    assert!(tracked_for_separator(&scratch.0, '\\').unwrap().is_empty());
}

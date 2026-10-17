use super::tracked_for_separator;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

static SEQUENCE: AtomicUsize = AtomicUsize::new(0);

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

#[test]
fn implicit_lane_selection_matches_published_path_separator_glob_behavior() {
    let scratch = Scratch::new();
    assert_eq!(tracked_for_separator(&scratch.0, '/').unwrap(), ["scope/zeta", "scope/dev"]);
    assert!(tracked_for_separator(&scratch.0, '\\').unwrap().is_empty());
}

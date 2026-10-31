use super::replace;
use crate::workspace::engine::command::scratch;
use std::fs;

#[test]
fn replacing_generated_manifest_preserves_injected_hardlink_contents() {
    let directory = scratch::Directory::create().unwrap();
    let root = directory.0.join("package.json");
    let injected = directory.0.join("injected-package.json");
    fs::write(&root, b"old manifest").unwrap();
    fs::hard_link(&root, &injected).unwrap();
    let old = fs::metadata(&root).unwrap();
    replace(&root, b"new manifest").unwrap();
    assert_eq!(fs::read(&root).unwrap(), b"new manifest");
    assert_eq!(fs::read(&injected).unwrap(), b"old manifest");
    assert_eq!(fs::metadata(&root).unwrap().permissions(), old.permissions());
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        assert_ne!(fs::metadata(&root).unwrap().ino(), old.ino());
        assert_eq!(fs::metadata(&injected).unwrap().ino(), old.ino());
    }
    assert_eq!(fs::read_dir(&directory.0).unwrap().count(), 2);
}

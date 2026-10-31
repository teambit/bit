//! Windows linking: symlinks where permitted, otherwise hard links for files and junctions
//! for directories, as `createLinkOrSymlink` and `symlink-dir` do there.

use super::super::{
    LinkKind, create_link_or_symlink, hard_link_directory, remove_path, symlink_dir,
};
use std::{fs, path::Path};

fn is_link(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|meta| meta.file_type().is_symlink())
}

#[test]
fn symlink_kind_links_a_file_whether_or_not_symlinks_are_permitted() {
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("src/file.ts");
    fs::create_dir_all(src.parent().unwrap()).unwrap();
    fs::write(&src, "content").unwrap();
    let dest = dir.path().join("node_modules/pkg/file.ts");
    create_link_or_symlink(&src, &dest, LinkKind::Symlink, false).unwrap();
    fs::write(&src, "changed").unwrap();
    assert_eq!(fs::read_to_string(&dest).unwrap(), "changed");
}

#[test]
fn symlink_kind_links_a_directory() {
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("comps/foo");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("index.ts"), "ts").unwrap();
    let dest = dir.path().join("node_modules/pkg/_src");
    create_link_or_symlink(&src, &dest, LinkKind::Symlink, false).unwrap();
    assert!(is_link(&dest));
    assert_eq!(fs::read_to_string(dest.join("index.ts")).unwrap(), "ts");
}

#[test]
fn a_junction_is_removed_without_touching_its_target() {
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("target");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("kept"), "x").unwrap();
    let dest = dir.path().join("junction");
    junction::create(&src, &dest).unwrap();
    assert!(is_link(&dest));
    remove_path(&dest).unwrap();
    assert!(!dest.exists());
    assert!(src.join("kept").exists());
}

#[test]
fn replaces_a_junction_and_keeps_a_valid_link() {
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("src");
    let other = dir.path().join("other");
    fs::create_dir_all(&src).unwrap();
    fs::create_dir_all(&other).unwrap();
    fs::write(src.join("marker"), "src").unwrap();
    let dest = dir.path().join("dest");
    junction::create(&other, &dest).unwrap();
    create_link_or_symlink(&src, &dest, LinkKind::HardLinkOrSymlink, true).unwrap();
    assert_eq!(fs::read_to_string(dest.join("marker")).unwrap(), "src");
    let created = fs::symlink_metadata(&dest)
        .unwrap()
        .created()
        .unwrap();
    create_link_or_symlink(&src, &dest, LinkKind::HardLinkOrSymlink, true).unwrap();
    let kept = fs::symlink_metadata(&dest)
        .unwrap()
        .created()
        .unwrap();
    assert_eq!(kept, created, "a valid link is kept");
}

#[test]
fn symlink_dir_falls_back_to_a_junction() {
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("shared");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("file"), "x").unwrap();
    let dest = dir.path().join("roots/pkg/shared");
    fs::create_dir_all(dest.parent().unwrap()).unwrap();
    symlink_dir(&src, &dest).unwrap();
    assert!(is_link(&dest));
    assert_eq!(fs::read_to_string(dest.join("file")).unwrap(), "x");
}

#[test]
fn hard_link_directory_mirrors_files_and_links_junctioned_directories() {
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("pkg");
    fs::create_dir_all(src.join("lib")).unwrap();
    fs::create_dir_all(src.join("node_modules/dep")).unwrap();
    fs::create_dir_all(dir.path().join("shared")).unwrap();
    fs::write(src.join("lib/index.js"), "js").unwrap();
    junction::create(dir.path().join("shared"), src.join("shared")).unwrap();
    let dest = dir.path().join("roots/env/node_modules/pkg");
    hard_link_directory(&src, std::slice::from_ref(&dest)).unwrap();
    fs::write(src.join("lib/index.js"), "changed").unwrap();
    assert_eq!(fs::read_to_string(dest.join("lib/index.js")).unwrap(), "changed");
    assert!(is_link(&dest.join("shared")));
    assert!(!dest.join("node_modules").exists());
}

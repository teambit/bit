use super::{
    LinkKind, create_link_or_symlink, hard_link_directory, may_link_target, relative_path,
    remove_path,
};
use std::{fs, path::Path};

#[test]
fn relative_path_walks_up_to_the_common_ancestor() {
    let relative = relative_path(Path::new("/a/b/c"), Path::new("/a/d/e"));
    assert_eq!(relative, Path::new("../../d/e"));
    assert_eq!(relative_path(Path::new("/a/b"), Path::new("/a/b/c")), Path::new("c"));
    assert_eq!(relative_path(Path::new("/a/./b/../c"), Path::new("/a/d")), Path::new("../d"));
}

#[test]
fn remove_path_deletes_trees_and_ignores_missing_paths() {
    let dir = tempfile::tempdir().unwrap();
    let tree = dir.path().join("tree");
    fs::create_dir_all(tree.join("nested")).unwrap();
    fs::write(tree.join("nested/file"), "x").unwrap();
    remove_path(&tree).unwrap();
    assert!(!tree.exists());
    remove_path(&tree).unwrap();
}

#[test]
fn may_link_target_refuses_real_directories_unless_installed_locally() {
    let dir = tempfile::tempdir().unwrap();
    assert!(may_link_target(&dir.path().join("missing"), false));
    assert!(!may_link_target(dir.path(), false));
    assert!(may_link_target(dir.path(), true));
}

#[cfg(unix)]
#[test]
fn symlink_kind_creates_an_absolute_symlink() {
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("src/file.ts");
    fs::create_dir_all(src.parent().unwrap()).unwrap();
    fs::write(&src, "content").unwrap();
    let dest = dir.path().join("node_modules/pkg/file.ts");
    create_link_or_symlink(&src, &dest, LinkKind::Symlink, false).unwrap();
    assert_eq!(fs::read_link(&dest).unwrap(), src);
    assert_eq!(fs::read_to_string(&dest).unwrap(), "content");
}

#[cfg(unix)]
#[test]
fn hard_link_kind_hard_links_files_and_symlinks_directories() {
    use std::os::unix::fs::MetadataExt;
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("package.json");
    fs::write(&file, "{}").unwrap();
    let file_dest = dir.path().join("injected/package.json");
    create_link_or_symlink(&file, &file_dest, LinkKind::HardLinkOrSymlink, false).unwrap();
    assert_eq!(fs::metadata(&file).unwrap().ino(), fs::metadata(&file_dest).unwrap().ino());
    let dir_dest = dir.path().join("linked");
    create_link_or_symlink(
        dir.path().join("injected").as_path(),
        &dir_dest,
        LinkKind::HardLinkOrSymlink,
        false,
    )
    .unwrap();
    assert_eq!(fs::read_link(&dir_dest).unwrap(), dir.path().join("injected"));
}

#[cfg(unix)]
#[test]
fn replaces_existing_entries_unless_already_valid() {
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("src");
    fs::create_dir(&src).unwrap();
    let dest = dir.path().join("dest");
    fs::write(&dest, "stale").unwrap();
    create_link_or_symlink(&src, &dest, LinkKind::HardLinkOrSymlink, true).unwrap();
    assert_eq!(fs::read_link(&dest).unwrap(), src);
    fs::remove_file(&dest).unwrap();
    std::os::unix::fs::symlink(&src, &dest).unwrap();
    let inode = || std::os::unix::fs::MetadataExt::ino(&fs::symlink_metadata(&dest).unwrap());
    let before = inode();
    create_link_or_symlink(&src, &dest, LinkKind::HardLinkOrSymlink, true).unwrap();
    assert_eq!(inode(), before, "a valid link is kept");
}

#[cfg(unix)]
#[test]
fn hard_link_directory_mirrors_files_and_skips_node_modules() {
    use std::os::unix::fs::{MetadataExt, symlink};
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("pkg");
    fs::create_dir_all(src.join("lib")).unwrap();
    fs::create_dir_all(src.join("node_modules/dep")).unwrap();
    fs::create_dir_all(dir.path().join("shared")).unwrap();
    fs::write(src.join("lib/index.js"), "js").unwrap();
    fs::write(dir.path().join("source.ts"), "ts").unwrap();
    symlink(dir.path().join("source.ts"), src.join("source.ts")).unwrap();
    symlink(dir.path().join("shared"), src.join("shared")).unwrap();
    symlink(dir.path().join("missing"), src.join("broken")).unwrap();
    let dest = dir.path().join("roots/env/node_modules/pkg");
    hard_link_directory(&src, std::slice::from_ref(&dest)).unwrap();
    let ino = |path: &Path| fs::metadata(path).unwrap().ino();
    assert_eq!(ino(&src.join("lib/index.js")), ino(&dest.join("lib/index.js")));
    assert_eq!(ino(&dir.path().join("source.ts")), ino(&dest.join("source.ts")));
    assert!(
        fs::symlink_metadata(dest.join("shared"))
            .unwrap()
            .file_type()
            .is_symlink(),
    );
    assert!(!dest.join("node_modules").exists());
    assert!(!dest.join("broken").exists());
}

#[cfg(unix)]
#[test]
fn hard_link_directory_creates_the_destination_for_a_symlinked_directory() {
    use std::os::unix::fs::symlink;
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("pkg");
    fs::create_dir_all(&src).unwrap();
    fs::create_dir_all(dir.path().join("shared")).unwrap();
    symlink(dir.path().join("shared"), src.join("shared")).unwrap();
    let dest = dir.path().join("roots/env/node_modules/pkg");
    hard_link_directory(&src, std::slice::from_ref(&dest)).unwrap();
    assert!(
        fs::symlink_metadata(dest.join("shared"))
            .unwrap()
            .file_type()
            .is_symlink(),
    );
}

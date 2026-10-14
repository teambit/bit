use super::{Environment, NodeCli, Source, Target, find_in};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tempfile::TempDir;

const ENTRY: &str = "node_modules/@teambit/bit/bin/bit";
const NODE: &str = if cfg!(windows) { "node.exe" } else { "bin/node" };

fn write(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, content).unwrap();
}

/// `<root>/.bvm/{nodejs/<versions>/bin/node, versions/<v>/bit-<v>/<ENTRY>, links/bit -> ...}`.
fn bvm(root: &Path, node_versions: &[&str]) -> PathBuf {
    let bvm = root.join(".bvm");
    for version in node_versions {
        write(
            &bvm.join("nodejs")
                .join(version)
                .join(NODE),
            "",
        );
    }
    let install = bvm
        .join("versions")
        .join("2.2.94")
        .join("bit-2.2.94");
    write(&install.join(ENTRY), "");
    write(
        &install.join("node_modules/@teambit/bit/package.json"),
        r#"{ "name": "@teambit/bit", "version": "2.2.94" }"#,
    );
    fs::create_dir_all(bvm.join("links")).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&install, bvm.join("links").join("bit")).unwrap();
    #[cfg(windows)]
    std::os::windows::fs::symlink_dir(&install, bvm.join("links").join("bit")).unwrap();
    bvm
}

fn entry(target: Target) -> NodeCli {
    match target {
        Target::Entry(cli) => cli,
        Target::Wrapper(path) => panic!("expected an entry, found wrapper {}", path.display()),
    }
}

#[test]
fn bit_node_cli_wins_and_runs_with_node_from_path() {
    let dir = TempDir::new().unwrap();
    let checkout = dir.path().join("checkout");
    write(&checkout.join("bin/bit.js"), "");
    write(&checkout.join("package.json"), r#"{ "name": "bit-workspace" }"#);
    write(
        &checkout.join("node_modules/@teambit/bit/package.json"),
        r#"{ "name": "@teambit/bit" }"#,
    );
    let environment =
        Environment { node_cli: Some(checkout.join("bin/bit.js")), ..Environment::default() };
    let cli = entry(find_in(&environment).unwrap());
    assert_eq!(cli.source, Source::Env);
    assert_eq!(cli.entry, checkout.join("bin/bit.js"));
    assert_eq!(cli.node, PathBuf::from("node"));
    assert_eq!(cli.bit_dir, Some(checkout.join("node_modules/@teambit/bit")));
    assert_eq!(cli.bvm_link, None);
}

#[test]
fn bit_node_binary_overrides_node() {
    let dir = TempDir::new().unwrap();
    let entry_path = dir.path().join("pkg/bin/bit");
    write(&entry_path, "");
    let environment = Environment {
        node_cli: Some(entry_path),
        node_binary: Some(PathBuf::from("/opt/node/bin/node")),
        ..Environment::default()
    };
    let cli = entry(find_in(&environment).unwrap());
    assert_eq!(cli.node, PathBuf::from("/opt/node/bin/node"));
    assert_eq!(cli.bit_dir, None);
}

#[test]
fn missing_bit_node_cli_is_ignored() {
    let dir = TempDir::new().unwrap();
    let environment =
        Environment { node_cli: Some(dir.path().join("absent/bin/bit")), ..Environment::default() };
    assert!(find_in(&environment).is_err());
}

#[test]
fn entry_beside_executable_uses_newest_bvm_node() {
    let dir = TempDir::new().unwrap();
    let bvm = bvm(dir.path(), &["22.22.0", "24.3.1", "9.11.0"]);
    let install = bvm.join("versions/2.2.94/bit-2.2.94");
    let environment =
        Environment { executable: Some(install.join("bin").join("bit")), ..Environment::default() };
    let cli = entry(find_in(&environment).unwrap());
    assert_eq!(cli.source, Source::BesideExecutable);
    assert_eq!(cli.entry, install.join(ENTRY));
    assert_eq!(cli.node, bvm.join("nodejs/24.3.1").join(NODE));
    assert_eq!(cli.bit_dir, Some(install.join("node_modules/@teambit/bit")));
    assert_eq!(cli.bvm_link, None);
}

#[test]
fn bvm_default_link_reports_the_link_directory() {
    let dir = TempDir::new().unwrap();
    let bvm = bvm(dir.path(), &["22.22.0"]);
    let environment = Environment { bvm_dir: Some(bvm.clone()), ..Environment::default() };
    let cli = entry(find_in(&environment).unwrap());
    assert_eq!(cli.source, Source::BvmLink);
    assert_eq!(cli.entry, bvm.join("links/bit").join(ENTRY));
    assert_eq!(cli.node, bvm.join("nodejs/22.22.0").join(NODE));
    assert_eq!(cli.bvm_link, Some(bvm.join("links/bit")));
    assert_eq!(cli.bit_dir, Some(bvm.join("links/bit/node_modules/@teambit/bit")));
}

#[test]
fn bvm_config_names_the_link() {
    let dir = TempDir::new().unwrap();
    let bvm = bvm(dir.path(), &[]);
    fs::rename(bvm.join("links/bit"), bvm.join("links/bit-dev")).unwrap();
    write(&bvm.join("config/config.json"), r#"{ "DEFAULT_LINK": "bit-dev" }"#);
    let environment = Environment { bvm_dir: Some(bvm.clone()), ..Environment::default() };
    let cli = entry(find_in(&environment).unwrap());
    assert_eq!(cli.entry, bvm.join("links/bit-dev").join(ENTRY));
    assert_eq!(cli.node, PathBuf::from("node"));
}

#[cfg(unix)]
#[test]
fn path_wrapper_skips_this_executable() {
    let dir = TempDir::new().unwrap();
    let ours = dir.path().join("ours/bit");
    write(&ours, "");
    let theirs = dir.path().join("theirs/bit");
    write(&theirs, "#!/bin/sh\n");
    let path = std::env::join_paths([ours.parent().unwrap(), theirs.parent().unwrap()]).unwrap();
    let environment = Environment {
        executable: Some(fs::canonicalize(&ours).unwrap()),
        path: Some(path),
        ..Environment::default()
    };
    assert_eq!(find_in(&environment).unwrap(), Target::Wrapper(theirs));
}

#[test]
fn nothing_found_is_an_error_that_names_bit_node_cli() {
    let error = find_in(&Environment::default()).unwrap_err();
    assert!(error.to_string().contains("BIT_NODE_CLI"), "{error}");
}

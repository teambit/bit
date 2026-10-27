//! What every case shares in one test process: the Node.js CLI, a home and global
//! config of its own, and the `bit init` templates (`e2e-setup-template.ts`).

use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    sync::OnceLock,
};

/// The Node.js CLI the cases run against, from `bvm install <bit-version>`.
const BIT_VERSION: &str = include_str!("../bit-version");

/// The settings the e2e CI job writes with `bit config set` before the suites run.
const GLOBAL_CONFIG: &str = r#"{
    "analytics_reporting": "false",
    "error_reporting": "false",
    "user.name": "CI",
    "user.email": "ci@bit.dev"
}"#;

pub struct Shared {
    pub node_cli: PathBuf,
    /// The test process's directory: the home, the global config, the templates and
    /// every case's directory.
    pub root: PathBuf,
    pub workspace_template: PathBuf,
    pub bare_scope_template: PathBuf,
}

pub fn shared() -> &'static Shared {
    static SHARED: OnceLock<Shared> = OnceLock::new();
    SHARED.get_or_init(|| {
        let root = runs_dir().join(std::process::id().to_string());
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("home")).unwrap();
        fs::create_dir_all(root.join("globals/config")).unwrap();
        fs::write(root.join("globals/config/config.json"), GLOBAL_CONFIG).unwrap();
        let mut shared = Shared {
            node_cli: node_cli(),
            workspace_template: root.join(".setup-template-workspace"),
            bare_scope_template: root.join(".setup-template-bare-scope"),
            root,
        };
        shared.workspace_template = template(&shared, "workspace", &["init", "--no-package-json"]);
        shared.bare_scope_template = template(&shared, "bare-scope", &["init", "--bare"]);
        shared
    })
}

/// Outside any Bit workspace, unlike `CARGO_TARGET_TMPDIR`: `bit init` refuses to nest one.
/// A process leaves its directory behind, so runs from hours ago are removed.
fn runs_dir() -> PathBuf {
    let dir = env::temp_dir().join("bit-native-e2e");
    assert_outside_pnpm_workspace(&dir);
    for entry in fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
    {
        let stale = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .is_ok_and(|modified| {
                modified
                    .elapsed()
                    .is_ok_and(|age| age > STALE_RUN)
            });
        if stale {
            let _ = fs::remove_dir_all(entry.path());
        }
    }
    dir
}

const STALE_RUN: std::time::Duration = std::time::Duration::from_hours(6);

/// A workspace without a `package.json` (`bit init --no-package-json`) installs into the
/// nearest `pnpm-workspace.yaml` above it, so a case under one would write outside its
/// directory.
fn assert_outside_pnpm_workspace(dir: &Path) {
    let workspace = dir
        .ancestors()
        .find(|ancestor| ancestor.join("pnpm-workspace.yaml").is_file());
    assert!(
        workspace.is_none(),
        "the e2e cases would install into the pnpm workspace at {}: point TMPDIR outside it",
        workspace.unwrap_or(dir).display(),
    );
}

/// `BIT_E2E_NODE_CLI`, else the bvm installation of [`BIT_VERSION`].
fn node_cli() -> PathBuf {
    if let Some(cli) = env::var_os("BIT_E2E_NODE_CLI").filter(|cli| !cli.is_empty()) {
        return PathBuf::from(cli);
    }
    let version = BIT_VERSION.trim();
    let cli = bvm_dir()
        .join("versions")
        .join(version)
        .join(format!("bit-{version}"))
        .join("node_modules/@teambit/bit/bin/bit");
    assert!(
        cli.is_file(),
        "the e2e ports run the Node.js CLI {version}: run `bvm install {version}`, \
         or point BIT_E2E_NODE_CLI at another `@teambit/bit/bin/bit`",
    );
    cli
}

fn bvm_dir() -> PathBuf {
    if let Some(dir) = env::var_os("BVM_GLOBALS_DIR").filter(|dir| !dir.is_empty()) {
        return PathBuf::from(dir);
    }
    let home = if cfg!(windows) {
        env::var_os("LOCALAPPDATA").or_else(|| env::var_os("USERPROFILE"))
    } else {
        env::var_os("HOME")
    };
    PathBuf::from(home.expect("a home directory")).join(".bvm")
}

/// A directory the real `bit <args>` ran in, once per test process.
fn template(shared: &Shared, kind: &str, args: &[&str]) -> PathBuf {
    let dir = shared.root.join(format!(".setup-template-{kind}"));
    fs::create_dir_all(&dir).unwrap();
    let output = bit_command(shared, &dir)
        .args(args)
        .output()
        .unwrap();
    assert!(output.status.success(), "bit {args:?}: {}", String::from_utf8_lossy(&output.stderr));
    dir
}

/// The native binary with the case environment, in `cwd`.
pub fn bit_command(shared: &Shared, cwd: &Path) -> Command {
    let home = shared.root.join("home");
    let mut command = Command::new(env!("CARGO_BIN_EXE_bit"));
    command
        .current_dir(cwd)
        .env("BIT_NODE_CLI", &shared.node_cli)
        .env("HOME", &home)
        .env("USERPROFILE", &home)
        .env("BIT_GLOBALS_DIR", shared.root.join("globals"))
        .env("BIT_NATIVE_TRACE", "1")
        .env_remove("BIT_NATIVE")
        .env_remove("BIT_NATIVE_QUIET")
        .env_remove("BIT_FEATURES")
        .env_remove("CI")
        .env_remove("GITHUB_TOKEN")
        .env_remove("BIT_GITHUB_TOKEN")
        .env_remove("GITHUB_REPOSITORY")
        .env_remove("GITHUB_HEAD_REF");
    if super::on_node() {
        command.env("BIT_NATIVE", "off");
    }
    command
}

/// `copySync`.
pub fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        let kind = entry.file_type().unwrap();
        if kind.is_dir() {
            copy_dir(&entry.path(), &target);
        } else if kind.is_symlink() {
            copy_link(&entry.path(), &target);
        } else {
            let source = entry.path();
            fs::copy(&source, &target)
                .unwrap_or_else(|error| panic!("copy fixture {source:?} -> {target:?}: {error}"));
        }
    }
}

#[cfg(unix)]
fn copy_link(from: &Path, to: &Path) {
    std::os::unix::fs::symlink(fs::read_link(from).unwrap(), to).unwrap();
}

#[cfg(windows)]
fn copy_link(from: &Path, to: &Path) {
    use std::os::windows::fs::FileTypeExt;
    let target = fs::read_link(from).unwrap();
    if fs::symlink_metadata(from)
        .unwrap()
        .file_type()
        .is_symlink_dir()
    {
        std::os::windows::fs::symlink_dir(target, to).unwrap();
    } else {
        std::os::windows::fs::symlink_file(target, to).unwrap();
    }
}

#[cfg(windows)]
#[test]
fn restoring_a_directory_link_preserves_its_kind_before_its_target_exists() {
    use std::os::windows::fs::{FileTypeExt, symlink_dir};
    let directory = tempfile::tempdir().unwrap();
    let source = directory.path().join("source");
    let restored = directory.path().join("restored");
    fs::create_dir(&source).unwrap();
    let target = directory.path().join("not-yet-restored");
    symlink_dir(&target, source.join("link")).unwrap();
    copy_dir(&source, &restored);
    assert!(
        fs::symlink_metadata(restored.join("link"))
            .unwrap()
            .file_type()
            .is_symlink_dir(),
    );
    assert_eq!(
        fs::read_link(restored.join("link")).unwrap(),
        fs::read_link(source.join("link")).unwrap(),
    );
    fs::create_dir(&target).unwrap();
    assert!(restored.join("link").is_dir());
}

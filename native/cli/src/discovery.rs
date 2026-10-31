//! Where the Node.js Bit CLI is. Discovery inspects paths only; it never
//! downloads, resolves modules or runs Node. In order:
//!
//! 1. `BIT_NODE_CLI`: the JavaScript entry, `@teambit/bit`'s `bin/bit` or a
//!    checkout's `bin/bit.js`.
//! 2. The entry beside this executable: `<dir>/../node_modules/@teambit/bit/bin/bit`,
//!    the bvm layout once bvm ships this binary as `bin/bit`.
//! 3. The checkout this executable was built in: `<checkout>/bin/bit.js` for an
//!    executable at `<checkout>/native/target/<profile>/bit`, when the checkout has its
//!    dependencies installed. A local build pairs with the Node.js CLI of its own commit.
//! 4. bvm's default link: `<bvm>/links/<link>/node_modules/@teambit/bit/bin/bit`.
//! 5. A `bit` on `PATH` that is not this executable: bvm's wrapper script.
//!
//! The entry runs with `BIT_NODE_BINARY`, else the newest Node bvm installed
//! beside the entry, else `node` from `PATH`.

#[cfg(test)]
mod discovery_tests;

use std::{
    env,
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

/// How a delegated command runs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    /// `node <entry> <args>`.
    Entry(NodeCli),
    /// An executable that is itself the Node.js CLI, with its own Node.
    Wrapper(PathBuf),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeCli {
    /// `<@teambit/bit>/bin/bit`, or a checkout's `bin/bit.js`.
    pub entry: PathBuf,
    /// An absolute Node, or `node` to resolve on `PATH`.
    pub node: PathBuf,
    /// The `@teambit/bit` package the entry belongs to or requires.
    pub bit_dir: Option<PathBuf>,
    /// `<…/.bvm>/links/<name>` when the entry is reached through a bvm link,
    /// which is what the Node.js CLI's `findCurrentBvmDir()` reports.
    pub bvm_link: Option<PathBuf>,
    pub source: Source,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Env,
    BesideExecutable,
    Checkout,
    BvmLink,
}

/// The process facts discovery reads, separable from the process for tests.
#[derive(Debug, Default, Clone)]
pub struct Environment {
    /// `BIT_NODE_CLI`.
    pub node_cli: Option<PathBuf>,
    /// `BIT_NODE_BINARY`.
    pub node_binary: Option<PathBuf>,
    /// This executable, canonical.
    pub executable: Option<PathBuf>,
    /// bvm's directory: `BVM_GLOBALS_DIR`, else `%LOCALAPPDATA%\.bvm` on
    /// Windows, else `~/.bvm`.
    pub bvm_dir: Option<PathBuf>,
    pub path: Option<OsString>,
}

const NOT_FOUND: &str = "the Node.js Bit CLI was not found. Set BIT_NODE_CLI to the path of @teambit/bit's bin/bit (or a checkout's bin/bit.js), install bit with bvm, or put the Node.js bit on PATH";
const ENTRY_IN_PACKAGE: &str = "node_modules/@teambit/bit/bin/bit";

pub fn find() -> io::Result<Target> {
    find_in(&Environment::from_process())
}

pub fn find_in(environment: &Environment) -> io::Result<Target> {
    let cli = from_env(environment)
        .or_else(|| beside_executable(environment))
        .or_else(|| in_checkout(environment))
        .or_else(|| bvm_link(environment));
    if let Some(cli) = cli {
        return Ok(Target::Entry(cli));
    }
    path_wrapper(environment)
        .map(Target::Wrapper)
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, NOT_FOUND))
}

impl Environment {
    pub fn from_process() -> Self {
        Self {
            node_cli: env::var_os("BIT_NODE_CLI").map(PathBuf::from),
            node_binary: env::var_os("BIT_NODE_BINARY").map(PathBuf::from),
            executable: env::current_exe().and_then(fs::canonicalize).ok(),
            bvm_dir: bvm_dir(),
            path: env::var_os("PATH"),
        }
    }
}

fn bvm_dir() -> Option<PathBuf> {
    if let Some(dir) = env::var_os("BVM_GLOBALS_DIR").filter(|dir| !dir.is_empty()) {
        return Some(PathBuf::from(dir));
    }
    let home = if cfg!(windows) {
        env::var_os("LOCALAPPDATA").or_else(|| env::var_os("USERPROFILE"))
    } else {
        env::var_os("HOME")
    };
    home.map(|home| PathBuf::from(home).join(".bvm"))
}

fn from_env(environment: &Environment) -> Option<NodeCli> {
    let entry = environment.node_cli.as_ref().filter(|entry| entry.is_file())?;
    Some(node_cli(entry.clone(), Source::Env, environment))
}

fn beside_executable(environment: &Environment) -> Option<NodeCli> {
    let executable = environment.executable.as_ref()?;
    let entry = executable
        .parent()?
        .parent()?
        .join(ENTRY_IN_PACKAGE);
    entry.is_file().then(|| node_cli(entry, Source::BesideExecutable, environment))
}

fn in_checkout(environment: &Environment) -> Option<NodeCli> {
    let target = environment.executable
        .as_ref()?
        .parent()?
        .parent()?;
    let native = target.parent()?;
    if target.file_name()? != "target" || native.file_name()? != "native" {
        return None;
    }
    let entry = native
        .parent()?
        .join("bin")
        .join("bit.js");
    let installed = entry.is_file() && bit_dir(&entry).is_some();
    installed.then(|| node_cli(entry, Source::Checkout, environment))
}

fn bvm_link(environment: &Environment) -> Option<NodeCli> {
    let bvm = environment.bvm_dir.as_ref()?;
    let entry = bvm
        .join("links")
        .join(default_link(bvm))
        .join(ENTRY_IN_PACKAGE);
    entry.is_file().then(|| node_cli(entry, Source::BvmLink, environment))
}

/// bvm's `config/config.json` names the link `bvm install` maintains.
fn default_link(bvm: &Path) -> String {
    fs::read(bvm.join("config").join("config.json"))
        .ok()
        .and_then(|bytes| bit_workspace_config::parse_jsonc(&bytes).ok())
        .and_then(|config| {
            config["DEFAULT_LINK"]
                .as_str()
                .map(str::trim)
                .filter(|link| !link.is_empty())
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "bit".to_string())
}

fn path_wrapper(environment: &Environment) -> Option<PathBuf> {
    let names: &[&str] =
        if cfg!(windows) { &["bit.cmd", "bit.exe", "bit.bat", "bit"] } else { &["bit"] };
    env::split_paths(environment.path.as_ref()?)
        .filter(|dir| !dir.as_os_str().is_empty())
        .flat_map(|dir| {
            names
                .iter()
                .map(move |name| dir.join(name))
        })
        .find(|candidate| is_other_executable(candidate, environment.executable.as_deref()))
}

fn is_other_executable(candidate: &Path, this: Option<&Path>) -> bool {
    if !candidate.is_file() {
        return false;
    }
    fs::canonicalize(candidate).is_ok_and(|canonical| Some(canonical.as_path()) != this)
}

fn node_cli(entry: PathBuf, source: Source, environment: &Environment) -> NodeCli {
    let bvm = bvm_root(&entry);
    let node = environment.node_binary
        .clone()
        .or_else(|| bvm.as_deref().and_then(newest_bvm_node))
        .unwrap_or_else(|| PathBuf::from("node"));
    NodeCli { bit_dir: bit_dir(&entry), bvm_link: bvm_link_of(&entry), entry, node, source }
}

/// The bvm directory an entry lives in: an ancestor holding both `nodejs`
/// and `versions`.
fn bvm_root(entry: &Path) -> Option<PathBuf> {
    entry
        .ancestors()
        .find(|dir| dir.join("nodejs").is_dir() && dir.join("versions").is_dir())
        .map(Path::to_path_buf)
}

/// `<bvm>/nodejs/<version>/bin/node` of the highest version present.
fn newest_bvm_node(bvm: &Path) -> Option<PathBuf> {
    let versions = fs::read_dir(bvm.join("nodejs")).ok()?;
    versions
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_str()?.to_string();
            let node = node_in(&entry.path())?;
            Some((version_key(&name), node))
        })
        .max_by(|left, right| left.0.cmp(&right.0))
        .map(|(_, node)| node)
}

fn node_in(dir: &Path) -> Option<PathBuf> {
    let candidates: &[&str] =
        if cfg!(windows) { &["node.exe", "bin/node.exe"] } else { &["bin/node"] };
    candidates
        .iter()
        .map(|name| dir.join(name))
        .find(|node| node.is_file())
}

/// Numeric `major.minor.patch` ordering, with the text as a tie-breaker.
fn version_key(name: &str) -> (Vec<u64>, String) {
    let numbers = name
        .trim_start_matches('v')
        .split('.')
        .map(|part| part.parse().unwrap_or(0))
        .collect();
    (numbers, name.to_string())
}

/// The `@teambit/bit` package: the entry's own package, or the one a
/// checkout's `bin/bit.js` requires from its `node_modules`.
fn bit_dir(entry: &Path) -> Option<PathBuf> {
    let bin = entry.parent()?;
    let root = bin.parent()?;
    [
        root.to_path_buf(),
        root.join("node_modules")
            .join("@teambit")
            .join("bit"),
    ]
    .into_iter()
    .find(|dir| is_bit_package(dir))
}

fn is_bit_package(dir: &Path) -> bool {
    fs::read(dir.join("package.json"))
        .ok()
        .and_then(|bytes| bit_workspace_config::parse_jsonc(&bytes).ok())
        .is_some_and(|manifest| manifest["name"].as_str().map(str::trim) == Some("@teambit/bit"))
}

/// `findBvmDir` of `@teambit/bvm.path`: the ancestor whose parent is `links`
/// inside `.bvm`.
fn bvm_link_of(entry: &Path) -> Option<PathBuf> {
    entry
        .ancestors()
        .find(|dir| {
            let parent = dir.parent();
            parent
                .and_then(Path::file_name)
                .is_some_and(|name| name == "links")
                && parent
                    .and_then(Path::parent)
                    .and_then(Path::file_name)
                    .is_some_and(|name| name == ".bvm")
        })
        .map(Path::to_path_buf)
}

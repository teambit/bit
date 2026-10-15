//! `commandSnapshotReceipt`: what the engine cannot know about the snaps
//! it writes. New hashes and a batch id (`newSnapHash`, `newSnapBatchId`),
//! the user's log (`getBasicLog`) and the Node.js CLI's version.

use crate::{
    commands::status::{cache::cache_root, js::decline},
    discovery::{self, Target},
};
use bit_install::config::{
    EffectiveConfig, ScopeJson, WorkspaceConfig, load_global_config, scope_path,
};
use serde_json::{Map, Value, json};
use sha1::{Digest, Sha1};
use std::{
    collections::HashMap,
    fmt::Write,
    fs, io,
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

/// How long the Bit Cloud user lookup may take; Node's `fetch` has no limit.
const CLOUD_TIMEOUT: Duration = Duration::from_secs(30);

/// The receipt for snapping `identities`.
/// The components a snap writes: identities, new hashes and dependency graphs.
pub struct Snapped<'s> {
    pub identities: &'s [String],
    pub hashes: &'s [String],
    pub graphs: &'s [Option<String>],
}

/// `count` new snap hashes, allocated before the dependency graphs that
/// name them.
pub fn new_snap_hashes(count: usize) -> io::Result<Vec<String>> {
    (0..count).map(|_| new_snap_hash()).collect()
}

/// The receipt for the snapped components; `lane_log` adds the lane
/// history's log (`laneLog`).
pub fn snapshot(root: &Path, snapped: &Snapped<'_>, lane_log: bool) -> io::Result<Value> {
    let user = User::load(root)?;
    let versions: Vec<Value> = snapped.identities
        .iter()
        .zip(snapped.hashes)
        .zip(snapped.graphs)
        .map(|((identity, hash), graph)| {
            let mut version = json!({ "identity": identity, "hash": hash });
            if let Some(graph) = graph {
                version["dependenciesGraph"] = json!(graph);
            }
            version
        })
        .collect();
    let mut receipt = json!({
        "versions": versions,
        "log": user.log(),
        "batchId": uuid_v4()?,
        "bitVersion": bit_version()?,
    });
    if lane_log {
        receipt["laneLog"] = user.log();
    }
    Ok(receipt)
}

/// `getIdentity()`: the user's name and email.
pub struct User {
    username: Option<String>,
    email: Option<String>,
}

impl User {
    /// `getBitCloudUsername() || getConfig('user.name')` and
    /// `getConfig('user.email')`, the git config being the last layer.
    pub fn load(root: &Path) -> io::Result<Self> {
        let global = load_global_config(&cache_root().join("config"))?;
        let scope = ScopeJson::load(&scope_path(root))?;
        let workspace = WorkspaceConfig::load(root)?;
        let config = EffectiveConfig::new(&global, &scope.config, &workspace.config_store);
        let cloud = config
            .get("user.token")
            .and_then(|token| cloud_username(&config.cloud_domain(), &token));
        let mut git = None;
        let mut get = |key: &str| {
            config
                .get(key)
                .or_else(|| {
                    git.get_or_insert_with(git_config)
                        .get(key)
                        .cloned()
                })
        };
        let username = cloud
            .filter(|username| !username.is_empty())
            .or_else(|| get("user.name"));
        Ok(Self { username, email: get("user.email") })
    }

    /// `getBasicLog()`: `undefined` fields are left out, as `JSON.stringify` does.
    pub fn log(&self) -> Value {
        let mut log = Map::new();
        if let Some(username) = &self.username {
            log.insert("username".into(), json!(username));
        }
        if let Some(email) = &self.email {
            log.insert("email".into(), json!(email));
        }
        log.insert("message".into(), json!(""));
        log.insert("date".into(), json!(now_millis().to_string()));
        Value::Object(log)
    }
}

/// `getBitCloudUser()?.username`: `GET https://api.<domain>/user` with the
/// token, read without a proxy like Node's `fetch`. Any failure is `None`.
fn cloud_username(domain: &str, token: &str) -> Option<String> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .ok()?;
    runtime.block_on(async {
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(CLOUD_TIMEOUT)
            .build()
            .ok()?;
        let response = client
            .get(format!("https://api.{domain}/user"))
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
            .send()
            .await
            .ok()?;
        let body: Value = response.json().await.ok()?;
        body["payload"]["username"].as_str().map(str::to_string)
    })
}

/// `gitconfig.get.sync()`: `git config --list` in the working directory,
/// each line split at its `=` signs, the second part being the value.
fn git_config() -> HashMap<String, String> {
    let Ok(output) = Command::new("git")
        .args(["config", "--list"])
        .output()
    else {
        return HashMap::new();
    };
    if !output.status.success() {
        return HashMap::new();
    }
    parse_git_config(&String::from_utf8_lossy(&output.stdout))
}

/// `_parseStdout`: `key=value` lines, the value ending at the next `=`;
/// the last line of a key wins.
fn parse_git_config(text: &str) -> HashMap<String, String> {
    text.split('\n')
        .filter_map(|line| {
            let mut parts = line.split('=');
            Some((parts.next()?.to_string(), parts.next()?.to_string()))
        })
        .collect()
}

fn now_millis() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_millis())
}

/// `newSnapHash()`: the SHA-1 of a random UUID.
fn new_snap_hash() -> io::Result<String> {
    let digest = Sha1::digest(uuid_v4()?.as_bytes());
    Ok(hex(&digest))
}

/// Lowercase hexadecimal.
fn hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut text, byte| {
            let _ = write!(text, "{byte:02x}");
            text
        })
}

/// `uuid.v4()`.
pub fn uuid_v4() -> io::Result<String> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).map_err(|error| io::Error::other(error.to_string()))?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex = hex(&bytes);
    Ok(format!("{}-{}-{}-{}-{}", &hex[0..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..32]))
}

/// The Node.js CLI the native commands stand in for: its Node (absolute,
/// `process.execPath`), its `@teambit/bit` package and that package's
/// version (`getBitVersion()`).
pub struct NodeCli {
    pub node: PathBuf,
    pub bit_dir: PathBuf,
    pub version: String,
}

impl NodeCli {
    pub fn find() -> io::Result<Self> {
        let Ok(Target::Entry(cli)) = discovery::find() else {
            return Err(decline("the Node.js CLI's version"));
        };
        let bit_dir = cli.bit_dir.ok_or_else(|| decline("the Node.js CLI's version"))?;
        let manifest: Value = serde_json::from_slice(&fs::read(bit_dir.join("package.json"))?)
            .map_err(io::Error::other)?;
        let version = manifest
            .get("version")
            .and_then(Value::as_str)
            .filter(|version| !version.is_empty());
        let version = version.ok_or_else(|| decline("the Node.js CLI's version"))?.to_string();
        let node = absolute_node(&cli.node).ok_or_else(|| decline("the Node.js executable"))?;
        Ok(Self { node, bit_dir, version })
    }
}

/// `node` resolved on `PATH` when discovery left it bare.
fn absolute_node(node: &Path) -> Option<PathBuf> {
    if node.is_absolute() {
        return Some(node.to_path_buf());
    }
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(node))
        .find(|candidate| candidate.is_file())
}

/// `getBitVersion()`: the version of the `@teambit/bit` package the Node.js
/// CLI runs from.
fn bit_version() -> io::Result<String> {
    NodeCli::find().map(|cli| cli.version)
}

#[cfg(test)]
mod receipt_tests;

//! The component file inventory of every status-like command: Bit's ignore lists and the workspace's patterns compiled with
//! `bit-ignore`, and the scan/finish requests of the workspace engine.

pub use rebase::normalize;

mod rebase;

use super::engine::Engine;
use bit_ignore::{Ignore, Rule};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

/// `ALWAYS_IGNORE_LIST` of `@teambit/legacy.constants`.
const ALWAYS_IGNORE: &[&str] = &[
    "**/.DS_Store",
    "**/.env",
    "**/.env.local",
    "**/.env.**.local",
    "**/component.json",
    "**/node_modules/**",
];
/// `BIT_GENERATED_IGNORE_LIST`; `IGNORE_LIST` is both lists.
const BIT_GENERATED_IGNORE: &[&str] = &["package.json", "**/package-lock.json", "**/yarn.lock"];
/// `IGNORE_ROOT_ONLY_LIST`.
const IGNORE_ROOT_ONLY: &[&str] = &[
    "tsconfig.json",
    ".eslintrc.json",
    ".prettierrc.cjs",
    ".oxlintrc.json",
    ".oxlintrc.jsonc",
    "oxlint.config.ts",
    "oxlint.config.js",
];

/// The workspace's ignore settings, as the engine's prepare/context requests report them.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    pub patterns: Vec<String>,
    pub track_all_files: bool,
    pub ignored_files: Vec<String>,
}

/// The compiled workspace rules every component scan starts from.
pub struct Inventory {
    root: Ignore,
    /// `ALWAYS_IGNORE_LIST`, or `IGNORE_LIST` without `trackAllFiles`.
    hard: Vec<&'static str>,
    ignored_root: &'static [&'static str],
}

#[derive(Deserialize)]
struct Scan {
    token: u64,
    nested: Vec<Nested>,
    own: Vec<String>,
}

#[derive(Deserialize)]
struct Nested {
    directory: String,
    patterns: Vec<String>,
}

impl Inventory {
    /// `ignore().add([...patterns, ...IGNORE_LIST, ...ignoredFiles])`.
    pub fn new(options: &Options) -> io::Result<Self> {
        let hard: Vec<&'static str> = if options.track_all_files {
            ALWAYS_IGNORE.to_vec()
        } else {
            ALWAYS_IGNORE
                .iter()
                .chain(BIT_GENERATED_IGNORE)
                .copied()
                .collect()
        };
        let ignored_root: &[&str] = if options.track_all_files { &[] } else { IGNORE_ROOT_ONLY };
        let patterns = options.patterns.iter().map(String::as_str);
        let ignored_files = options.ignored_files.iter().map(String::as_str);
        let mut root = Ignore::new();
        root.add(
            patterns
                .chain(hard.iter().copied())
                .chain(ignored_files),
        )
        .map_err(io::Error::other)?;
        Ok(Self { root, hard, ignored_root })
    }

    /// The root rules, as `rootPolicy`.
    pub fn root_policy(&self) -> Value {
        policy(self.root.rules())
    }

    /// Send `begin` (with `rootPolicy` added), then the matching finish
    /// request built from the scan's nested ignore files.
    pub fn scan(
        &self,
        engine: &mut Engine,
        mut begin: Value,
        finish_kind: &str,
    ) -> io::Result<Value> {
        begin["rootPolicy"] = self.root_policy();
        let scan: Scan = engine.request(&begin)?;
        let nested: Vec<String> = scan.nested
            .iter()
            .flat_map(|row| {
                row.patterns.iter().map(|pattern| rebase::pattern(pattern, &row.directory))
            })
            .collect();
        // Compiled in this order: the regex cache is shared.
        let combined = compile(Some(&self.root), &nested)?;
        let hard = compile(None, &self.hard)?;
        let own = compile(None, &scan.own)?;
        engine.request(&json!({
            "kind": finish_kind,
            "token": scan.token,
            "combined": policy(combined.rules()),
            "hard": policy(hard.rules()),
            "own": policy(own.rules()),
            "ignoredRoot": self.ignored_root,
        }))
    }
}

/// `ignore().add(base).add(patterns)`.
fn compile(base: Option<&Ignore>, patterns: &[impl AsRef<str>]) -> io::Result<Ignore> {
    let mut ignore = Ignore::new();
    if let Some(base) = base {
        ignore.add_ignore(base);
    }
    ignore
        .add(patterns.iter().map(AsRef::as_ref))
        .map_err(io::Error::other)?;
    Ok(ignore)
}

/// The ignore policy of a fresh instance: its rules and
/// its empty match cache.
fn policy(rules: &[Rule]) -> Value {
    json!({ "rules": rules, "cache": [] })
}

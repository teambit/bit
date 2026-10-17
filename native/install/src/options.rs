//! `bit install` argv parsing, matching Bit's yargs configuration
//! (`cli-parser.ts`: `boolean-negation: false`, camel-case expansion) for the
//! flags `install.cmd.tsx` declares.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io;

/// Parsed `bit install` flags. Field docs name the CLI flag; the last fields
/// carry `WorkspaceInstallOptions` that only programmatic installs set.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(perfectionist::too_many_struct_fields, reason = "One field per `bit install` flag.")
)]
pub struct InstallOptions {
    /// `[packages...]`
    pub packages: Vec<String>,
    /// `-t, --type [lifecycleType]`
    pub lifecycle_type: Option<String>,
    /// `-u, --update`
    pub update: bool,
    /// `--update-existing` (deprecated, prints a warning)
    pub update_existing: bool,
    /// `--save-prefix [savePrefix]`
    pub save_prefix: Option<String>,
    /// `--skip-dedupe`
    pub skip_dedupe: bool,
    /// `--skip-import`
    pub skip_import: bool,
    /// `--skip-compile`
    pub skip_compile: bool,
    /// `--skip-write-config-files`
    pub skip_write_config_files: bool,
    /// `-a, --add-missing-deps`
    pub add_missing_deps: bool,
    /// `--skip-unavailable`
    pub skip_unavailable: bool,
    /// `--add-missing-peers`
    pub add_missing_peers: bool,
    /// `--recurring-install`
    pub recurring_install: bool,
    /// `--no-optional`
    pub no_optional: bool,
    /// `--lockfile-only`
    pub lockfile_only: bool,
    /// `--restore`
    pub restore: bool,
    /// `--allow-scripts a,b` and `--disallow-scripts c`; disallow wins.
    pub allow_scripts: Option<IndexMap<String, bool>>,
    /// Arguments after `--`.
    pub package_manager_args: Vec<String>,
    /// `--log [level]`
    pub log: Option<String>,
    /// `InstallMain.install` called by another command rather than `bit install`:
    /// the command's own lines (runner, "Resolving...", summary) are not printed.
    pub programmatic: bool,
    /// `showExternalPackageManagerPrompt`: ask before leaving external package
    /// manager mode. `bit install` always asks.
    pub external_prompt: bool,
    /// `updateExisting` / `skipIfExisting` for packages added to the workspace policy.
    pub existing_entries: ExistingEntries,
    /// `skipPrune`
    pub skip_prune: bool,
    /// `optimizeReportForNonTerminal`: the package manager appends output lines.
    pub append_only: bool,
    /// `copyPeerToRuntimeOnRoot`; unset means `true`.
    pub copy_peer_to_runtime_on_root: Option<bool>,
    /// `copyPeerToRuntimeOnComponents`
    pub copy_peer_to_runtime_on_components: bool,
    /// `dependenciesGraph`: a serialized `DependenciesGraph` the caller already
    /// merged (`bit import` writing components); the lockfile is restored from it
    /// before installing, best-effort unless `restore` is set.
    pub dependencies_graph: Option<Value>,
}

/// What adding a package already in the workspace policy does
/// (`WorkspacePolicy.add` options).
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExistingEntries {
    /// `updateExisting`: the new entry replaces it. `bit install` always updates.
    #[default]
    Update,
    /// `skipIfExisting`: the existing entry stays.
    Skip,
    /// Neither: `EntryAlreadyExist`.
    Fail,
}

impl InstallOptions {
    /// The lifecycle new packages (and missing deps and peers) are added with:
    /// `lifecycleType || 'runtime'` (`_addPackages`). `bit install --add-missing-peers`
    /// sets the lifecycle to `peer` while parsing, as `install.cmd.tsx` does;
    /// `InstallMain.install` called with `addMissingPeers` alone adds them as runtime
    /// dependencies.
    #[must_use]
    pub fn lifecycle(&self) -> &str {
        self.lifecycle_type.as_deref().unwrap_or("runtime")
    }
}

/// What argv asks for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Parsed {
    Install(Box<InstallOptions>),
    /// `--help`/`-h`: rendered by Bit's help formatter.
    Help,
}

const COMMANDS: [&str; 2] = ["install", "in"];

/// Parse `argv` after the `bit` binary (`["install", ...]`).
pub fn parse(argv: &[String]) -> io::Result<Parsed> {
    let Some((command, rest)) = argv.split_first() else {
        return Err(invalid("missing command"));
    };
    if !COMMANDS.contains(&command.as_str()) {
        return Err(invalid(&format!("not an install command: {command}")));
    }
    // `install.cmd.tsx` always asks before leaving external package manager mode.
    let mut options = InstallOptions { external_prompt: true, ..InstallOptions::default() };
    let mut scripts = Scripts::default();
    let mut args = rest.iter().peekable();
    while let Some(arg) = args.next() {
        if arg == "--" {
            options.package_manager_args.extend(args.by_ref().cloned());
            break;
        }
        if !arg.starts_with('-') || arg == "-" {
            options.packages.push(arg.clone());
            continue;
        }
        let (name, inline) = split_flag(arg);
        if matches!(name.as_str(), "help" | "h") {
            return Ok(Parsed::Help);
        }
        let flag = flag(&name)?;
        let value = flag_value(flag.arity, inline, &mut args);
        apply(&mut options, &mut scripts, flag.key, value)?;
    }
    options.allow_scripts = scripts.finish();
    options.lifecycle_type = cli_lifecycle(&options);
    Ok(Parsed::Install(Box::new(options)))
}

/// `lifecycleType: options.addMissingPeers ? 'peer' : options.type`.
fn cli_lifecycle(options: &InstallOptions) -> Option<String> {
    if options.add_missing_peers {
        Some("peer".to_string())
    } else {
        options.lifecycle_type.clone()
    }
}

/// A switch takes only an inline `=value`; a value flag also takes the next
/// argument unless it is another flag.
fn flag_value<'a>(
    arity: Arity,
    inline: Option<String>,
    args: &mut std::iter::Peekable<impl Iterator<Item = &'a String>>,
) -> Option<String> {
    match (arity, inline) {
        (_, Some(value)) => Some(value),
        // yargs booleans take a following `true`/`false`.
        (Arity::Switch, None) => args
            .next_if(|next| matches!(next.as_str(), "true" | "false"))
            .cloned(),
        (Arity::Value, None) => args
            .next_if(|next| !next.starts_with('-'))
            .cloned(),
    }
}

#[derive(Clone, Copy)]
enum Arity {
    Switch,
    Value,
}

struct Flag {
    key: &'static str,
    arity: Arity,
}

/// `(long name, alias, arity)` as `install.cmd.tsx` and the global flags declare them.
const FLAGS: [(&str, Option<&str>, Arity); 21] = [
    ("type", Some("t"), Arity::Value),
    ("update", Some("u"), Arity::Switch),
    ("update-existing", None, Arity::Switch),
    ("save-prefix", None, Arity::Value),
    ("skip-dedupe", None, Arity::Switch),
    ("skip-import", None, Arity::Switch),
    ("skip-compile", None, Arity::Switch),
    ("skip-write-config-files", None, Arity::Switch),
    ("add-missing-deps", Some("a"), Arity::Switch),
    ("skip-unavailable", None, Arity::Switch),
    ("add-missing-peers", None, Arity::Switch),
    ("recurring-install", None, Arity::Switch),
    ("no-optional", None, Arity::Value),
    ("lockfile-only", None, Arity::Switch),
    ("restore", None, Arity::Switch),
    ("allow-scripts", None, Arity::Value),
    ("disallow-scripts", None, Arity::Value),
    ("log", None, Arity::Value),
    ("safe-mode", None, Arity::Switch),
    ("token", None, Arity::Value),
    ("json", Some("j"), Arity::Switch),
];

fn flag(name: &str) -> io::Result<Flag> {
    let dashed = dash_case(name);
    FLAGS
        .iter()
        .find(|(long, alias, _)| *long == dashed || alias.is_some_and(|alias| alias == name))
        .map(|(key, _, arity)| Flag { key, arity: *arity })
        .ok_or_else(|| invalid(&format!("Unknown argument: {name}")))
}

fn apply(
    options: &mut InstallOptions,
    scripts: &mut Scripts,
    key: &str,
    value: Option<String>,
) -> io::Result<()> {
    let enabled = value.as_deref().is_none_or(is_truthy);
    match key {
        "type" => options.lifecycle_type = value,
        "save-prefix" => options.save_prefix = value,
        "allow-scripts" => scripts.allow = value,
        "disallow-scripts" => scripts.disallow = value,
        "log" => options.log = Some(value.unwrap_or_default()),
        "safe-mode" | "token" | "json" => {}
        _ => *switch(options, key)? = enabled,
    }
    Ok(())
}

fn switch<'a>(options: &'a mut InstallOptions, key: &str) -> io::Result<&'a mut bool> {
    Ok(match key {
        "update" => &mut options.update,
        "update-existing" => &mut options.update_existing,
        "skip-dedupe" => &mut options.skip_dedupe,
        "skip-import" => &mut options.skip_import,
        "skip-compile" => &mut options.skip_compile,
        "skip-write-config-files" => &mut options.skip_write_config_files,
        "add-missing-deps" => &mut options.add_missing_deps,
        "skip-unavailable" => &mut options.skip_unavailable,
        "add-missing-peers" => &mut options.add_missing_peers,
        "recurring-install" => &mut options.recurring_install,
        "no-optional" => &mut options.no_optional,
        "lockfile-only" => &mut options.lockfile_only,
        "restore" => &mut options.restore,
        _ => return Err(invalid(&format!("Unknown argument: {key}"))),
    })
}

/// `--allow-scripts`/`--disallow-scripts` (`_parseAllowScriptsFlags`).
#[derive(Default)]
struct Scripts {
    allow: Option<String>,
    disallow: Option<String>,
}

impl Scripts {
    fn finish(self) -> Option<IndexMap<String, bool>> {
        if self.allow.is_none() && self.disallow.is_none() {
            return None;
        }
        let mut scripts = IndexMap::new();
        for (list, allowed) in [(self.allow, true), (self.disallow, false)] {
            let names = list.unwrap_or_default();
            for name in names
                .split(',')
                .map(str::trim)
                .filter(|name| !name.is_empty())
            {
                scripts.insert(name.to_string(), allowed);
            }
        }
        Some(scripts)
    }
}

fn split_flag(arg: &str) -> (String, Option<String>) {
    let name = arg.trim_start_matches('-');
    match name.split_once('=') {
        Some((name, value)) => (name.to_string(), Some(value.to_string())),
        None => (name.to_string(), None),
    }
}

/// yargs camel-case expansion: `--skipCompile` is `--skip-compile`.
fn dash_case(name: &str) -> String {
    let mut dashed = String::with_capacity(name.len() + 4);
    for character in name.chars() {
        if character.is_ascii_uppercase() {
            dashed.push('-');
            dashed.push(character.to_ascii_lowercase());
        } else {
            dashed.push(character);
        }
    }
    dashed
}

fn is_truthy(value: &str) -> bool {
    !matches!(value, "false" | "0")
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

#[cfg(test)]
mod tests;

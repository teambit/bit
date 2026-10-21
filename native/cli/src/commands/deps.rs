//! Native `bit deps <set|reset|eject>` (`bit dependencies`) (`scopes/dependencies/dependencies/dependencies-cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    aspect::{is_supported_pattern, workspace_default_scope, write_bitmap_if_changed},
    color::Chalk,
    lane::scope_root,
    scope_set::{Failure, selection},
    set_peer::apply_dep_resolver_config,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::{dependencies::cache::invalidation::deps_dir, workspace::Bitmap};
use serde::Serialize;
use serde_json::{Map, Value, json, ser::PrettyFormatter};
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "deps", aliases: &["dependencies"], run };

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Subcommand {
    Set { pattern: String, packages: Vec<(String, String)>, dev: bool, optional: bool, peer: bool },
    Reset { pattern: String },
    Eject { pattern: String },
    Unrecognized(String),
}

struct BitmapMutation {
    root: PathBuf,
    reason: String,
    bitmap_before: Vec<u8>,
    bitmap_val: Value,
    bitmap_changed: bool,
}

impl BitmapMutation {
    fn load(root: &Path) -> Result<(Self, Bitmap), Failure> {
        let workspace_bytes = fs::read(root.join("workspace.jsonc"))?;
        let bitmap_before = fs::read(root.join(".bitmap"))?;
        let workspace_val = bit_object_import::parse_jsonc(&workspace_bytes)?;
        let bitmap_val = bit_object_import::parse_jsonc(&bitmap_before)?;
        let default_scope = workspace_default_scope(&workspace_val)?;
        let bitmap = Bitmap::load(root, Some(&default_scope))?;
        Ok((
            Self {
                root: root.to_path_buf(),
                reason: String::new(),
                bitmap_before,
                bitmap_val,
                bitmap_changed: false,
            },
            bitmap,
        ))
    }

    fn flush(&self) -> io::Result<()> {
        write_bitmap_if_changed(
            &self.root,
            &self.bitmap_before,
            &self.bitmap_val,
            self.bitmap_changed,
            &self.reason,
        )?;
        let _ = fs::remove_dir_all(deps_dir(&self.root));
        Ok(())
    }
}

enum Prepared {
    Set { mutation: BitmapMutation, changed_comps: Vec<String>, added_packages: Value },
    ListAction { mutation: BitmapMutation, summary: &'static str, comps: Vec<String> },
}

impl Subcommand {
    const fn loader_label(&self) -> &'static str {
        match self {
            Self::Set { .. } => "set",
            Self::Reset { .. } => "reset",
            Self::Eject { .. } => "eject",
            Self::Unrecognized(_) => "deps",
        }
    }
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("deps arguments are not UTF-8".into()));
    };
    let Some(subcommand) = parse_subcommand(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native deps grammar".into()));
    };
    let chalk = Chalk::detect(args);
    if let Subcommand::Unrecognized(sub) = &subcommand {
        return run_unrecognized(args, sub, chalk);
    }
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("deps requires a workspace".into()));
    };
    let label = subcommand.loader_label();
    match prepare(&root, &subcommand, chalk) {
        Ok(prepared) => {
            workspace_command::execute_then(&root, args, label, |_output| prepared.commit(chalk))
        }
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI deps error stack".into()));
            }
            workspace_command::execute_then(&root, args, label, |_output| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("deps: {reason}"))),
    }
}

fn run_unrecognized(args: &[OsString], sub: &str, chalk: Chalk) -> io::Result<Outcome> {
    let data = chalk.red(&format!(
        r#""{sub}" is not a subcommand of "dependencies", please run "bit dependencies --help" to list the subcommands"#,
    ));
    let report = Report { data, code: 0, details: None };
    match scope_root::discover().ok().flatten() {
        Some(root) if !root.bare => {
            workspace_command::execute_then(&root.path, args, "deps", |_| Ok(report))
        }
        Some(root) => workspace_command::execute_with_scope(&root.path, args, "deps", &report),
        None => {
            let mut stdout = io::stdout().lock();
            writeln!(stdout, "{}", report.data)?;
            stdout.flush()?;
            Ok(Outcome::Exit(ExitCode::SUCCESS))
        }
    }
}

pub(super) fn parse_subcommand(args: &[&str]) -> Option<Subcommand> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    match filtered.as_slice() {
        ["set", rest @ ..] => parse_set(rest),
        ["reset", pattern] if is_supported_pattern(pattern) => {
            Some(Subcommand::Reset { pattern: (*pattern).to_owned() })
        }
        ["eject", pattern] if is_supported_pattern(pattern) => {
            Some(Subcommand::Eject { pattern: (*pattern).to_owned() })
        }
        [sub]
            if !sub.starts_with('-')
                && !matches!(
                    *sub,
                    "get"
                        | "remove"
                        | "unset"
                        | "debug"
                        | "set"
                        | "reset"
                        | "eject"
                        | "blame"
                        | "usage"
                        | "diagnose"
                        | "circular"
                        | "write",
                ) =>
        {
            Some(Subcommand::Unrecognized((*sub).to_owned()))
        }
        _ => None,
    }
}

fn parse_set(rest: &[&str]) -> Option<Subcommand> {
    let mut dev = false;
    let mut optional = false;
    let mut peer = false;
    let mut positional = Vec::new();
    for &arg in rest {
        match arg {
            "-d" | "--dev" => dev = true,
            "-o" | "--optional" => optional = true,
            "-p" | "--peer" => peer = true,
            val if !val.starts_with('-') => positional.push(val),
            _ => return None,
        }
    }
    let [pattern, raw_pkgs @ ..] = positional.as_slice() else {
        return None;
    };
    if !is_supported_pattern(pattern) || raw_pkgs.is_empty() {
        return None;
    }
    let mut packages = Vec::with_capacity(raw_pkgs.len());
    for &raw_pkg in raw_pkgs {
        packages.push(split_pkg_name_and_explicit_ver(raw_pkg)?);
    }
    Some(Subcommand::Set { pattern: (*pattern).to_owned(), packages, dev, optional, peer })
}

fn split_pkg_name_and_explicit_ver(raw: &str) -> Option<(String, String)> {
    if raw.is_empty() || raw.chars().any(char::is_whitespace) {
        return None;
    }
    let (name, ver) = raw.rsplit_once('@')?;
    if !is_valid_pkg_name(name) || ver.is_empty() || ver == "latest" {
        return None;
    }
    Some((name.to_owned(), snap_to_semver(ver)))
}

fn is_valid_pkg_name(name: &str) -> bool {
    if let Some(scoped) = name.strip_prefix('@') {
        !scoped.is_empty() && scoped.contains('/') && !scoped.contains('@')
    } else {
        !name.is_empty() && !name.contains('@')
    }
}

fn snap_to_semver(ver: &str) -> String {
    if ver.len() == 40
        && ver
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        format!("0.0.0-{ver}")
    } else {
        ver.to_owned()
    }
}

fn prepare(root: &Path, subcommand: &Subcommand, chalk: Chalk) -> Result<Prepared, Failure> {
    let (mutation, bitmap) = BitmapMutation::load(root)?;
    match subcommand {
        Subcommand::Set {
            pattern,
            packages,
            dev,
            optional,
            peer,
        } => prepare_set(mutation, &bitmap, pattern, packages, (*dev, *optional, *peer), chalk),
        Subcommand::Reset { pattern } => prepare_list_action(
            mutation,
            &bitmap,
            pattern,
            chalk,
            format!("deps-reset ({pattern})"),
            "successfully reset dependencies",
            &(json!({ "policy": {} }), false, false),
        ),
        Subcommand::Eject { pattern } => prepare_list_action(
            mutation,
            &bitmap,
            pattern,
            chalk,
            format!("deps-eject ({pattern})"),
            "successfully ejected dependencies",
            &(json!({}), true, true),
        ),
        Subcommand::Unrecognized(_) => Err(Failure::Declined("handled earlier".into())),
    }
}

fn prepare_set(
    mut mutation: BitmapMutation,
    bitmap: &Bitmap,
    pattern: &str,
    packages: &[(String, String)],
    flags: (bool, bool, bool),
    chalk: Chalk,
) -> Result<Prepared, Failure> {
    let matched = selection::resolve_pattern_entries(&mutation.root, bitmap, pattern, chalk)?;
    let field = if flags.0 {
        "devDependencies"
    } else if flags.2 {
        "peerDependencies"
    } else {
        "dependencies"
    };
    let mut pkg_map = Map::new();
    for (name, ver) in packages {
        let entry_val = if flags.1 {
            json!({ "optional": true, "version": ver })
        } else {
            Value::String(ver.clone())
        };
        pkg_map.insert(name.clone(), entry_val);
    }
    let added_packages = Value::Object(pkg_map);
    let cfg = json!({ "policy": { field: &added_packages } });
    let mut changed_comps = Vec::with_capacity(matched.len());
    for entry in matched {
        if apply_dep_resolver_config(
            &mutation.root,
            &mut mutation.bitmap_val,
            entry,
            cfg.clone(),
            true,
            true,
        )? {
            mutation.bitmap_changed = true;
        }
        changed_comps.push(entry.id.to_string_without_version());
    }
    mutation.reason = format!("deps-set ({pattern})");
    Ok(Prepared::Set { mutation, changed_comps, added_packages })
}

fn prepare_list_action(
    mut mutation: BitmapMutation,
    bitmap: &Bitmap,
    pattern: &str,
    chalk: Chalk,
    reason: String,
    summary: &'static str,
    cfg_spec: &(Value, bool, bool),
) -> Result<Prepared, Failure> {
    let matched = selection::resolve_pattern_entries(&mutation.root, bitmap, pattern, chalk)?;
    let mut comps = Vec::with_capacity(matched.len());
    for entry in matched {
        if apply_dep_resolver_config(
            &mutation.root,
            &mut mutation.bitmap_val,
            entry,
            cfg_spec.0.clone(),
            cfg_spec.1,
            cfg_spec.2,
        )? {
            mutation.bitmap_changed = true;
        }
        comps.push(selection::entry_full_id(entry));
    }
    mutation.reason = reason;
    Ok(Prepared::ListAction { mutation, summary, comps })
}

fn format_json_indent_4(val: &Value) -> io::Result<String> {
    let mut buf = Vec::new();
    let mut ser =
        serde_json::Serializer::with_formatter(&mut buf, PrettyFormatter::with_indent(b"    "));
    val.serialize(&mut ser).map_err(io::Error::other)?;
    String::from_utf8(buf).map_err(io::Error::other)
}

impl Prepared {
    fn commit(self, chalk: Chalk) -> io::Result<Report> {
        let formatter = Formatter::new(chalk);
        let data = match self {
            Self::Set {
                mutation,
                changed_comps,
                added_packages,
            } => {
                mutation.flush()?;
                let comp_items = changed_comps
                    .iter()
                    .map(|comp| formatter.item(comp))
                    .collect::<Vec<_>>();
                let comp_section = formatter.section("changed components", "", &comp_items);
                let pkg_section = format!(
                    "{}\n{}",
                    formatter.title("added packages"),
                    format_json_indent_4(&added_packages)?,
                );
                Formatter::join(&[
                    formatter.success_summary("successfully updated dependencies"),
                    comp_section,
                    pkg_section,
                ])
            }
            Self::ListAction { mutation, summary, comps } => {
                mutation.flush()?;
                let items = comps
                    .iter()
                    .map(|comp| formatter.item(comp))
                    .collect::<Vec<_>>();
                Formatter::join(&[formatter.success_summary(summary), items.join("\n")])
            }
        };
        Ok(Report { data, code: 0, details: None })
    }
}

//! Native `cat-object`, `cat-component` (`cmp`), `cat-lane` (`cl`),
//! `cat-version-history` (`cvh`), and `cat-lane-history` (`clh`).

pub(in crate::commands) mod lookup;

use self::lookup::{
    diagnose_component_lookup_error, diagnose_lane_lookup_error, load_cat_component,
    resolve_component_entry, resolve_lane_entry,
};
use super::{
    Command,
    color::Chalk,
    lane::scope_root::{self, ScopeRoot},
    workspace_command::{
        self, execute_failure_scope, execute_then, execute_with_scope, execute_without_loader,
        execute_without_loader_scope, results::Report,
    },
};
use crate::{history::History, native::Outcome};
use serde::Serialize;
use serde_json::{Value, json, ser::PrettyFormatter};
use sha1::{Digest, Sha1};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::{Path, PathBuf},
    process::ExitCode,
};

pub const CAT_OBJECT: Command = Command { name: "cat-object", aliases: &[], run: run_object };
pub const CAT_COMPONENT: Command =
    Command { name: "cat-component", aliases: &["cmp"], run: run_component };
pub const CAT_LANE: Command = Command { name: "cat-lane", aliases: &["cl"], run: run_lane };
pub const CAT_VERSION_HISTORY: Command =
    Command { name: "cat-version-history", aliases: &["cvh"], run: run_version_history };
pub const CAT_LANE_HISTORY: Command =
    Command { name: "cat-lane-history", aliases: &["clh"], run: run_lane_history };

#[derive(Debug, Default, PartialEq, Eq)]
struct ObjectOptions {
    hash: String,
    pretty: bool,
    stringify: bool,
    headers: bool,
}

fn parse_object_options(args: &[&str]) -> Option<ObjectOptions> {
    let mut opts = ObjectOptions::default();
    for &arg in args {
        match arg {
            "-p" | "--pretty" => opts.pretty = true,
            "-s" | "--stringify" => opts.stringify = true,
            "--headers" => opts.headers = true,
            "--no-color" => {}
            val if !val.starts_with('-') && opts.hash.is_empty() => val.clone_into(&mut opts.hash),
            _ => return None,
        }
    }
    (opts.hash.len() == 40 && opts.hash.bytes().all(|byte| byte.is_ascii_hexdigit())).then_some(
        opts,
    )
}

#[derive(Debug, Default, PartialEq, Eq)]
struct IdJsonOptions {
    id: String,
    json: bool,
}

fn parse_id_json_options(args: &[&str]) -> Option<IdJsonOptions> {
    let mut opts = IdJsonOptions::default();
    for &arg in args {
        match arg {
            "-j" | "--json" => opts.json = true,
            "--no-color" => {}
            val if !val.starts_with('-') && opts.id.is_empty() => val.clone_into(&mut opts.id),
            _ => return None,
        }
    }
    (!opts.id.is_empty()).then_some(opts)
}

fn parse_single_id(args: &[&str]) -> Option<String> {
    let mut id = None;
    for &arg in args {
        match arg {
            "--no-color" => {}
            val if !val.starts_with('-') && id.is_none() => id = Some(val.to_owned()),
            _ => return None,
        }
    }
    id.filter(|text| !text.is_empty())
}

fn run_object(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("cat-object arguments are not UTF-8".into()));
    };
    let Some(opts) = parse_object_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native cat-object grammar".into()));
    };
    let Ok(Some(root)) = scope_root::discover() else {
        return Ok(Outcome::Declined("cat-object requires a scope".into()));
    };
    let scope_dir = scope_dir_for(&root);
    let Some(data) = render_cat_object(&scope_dir, &opts) else {
        return Ok(Outcome::Declined("cat-object delegated".into()));
    };
    emit_text(&root, args, "cat-object", false, data)
}

fn render_cat_object(scope_dir: &Path, opts: &ObjectOptions) -> Option<String> {
    let (headers, body) = bit_object_import::read_raw_scope_object(scope_dir, &opts.hash).ok()??;
    if opts.headers {
        return Some(headers.join(","));
    }
    let content = String::from_utf8(body).ok()?;
    if opts.stringify {
        return serde_json::to_string(&content).ok();
    }
    let kind = headers.first()?.as_str();
    match kind {
        "Version" | "Component" | "Symlink" | "ScopeMeta" | "VersionHistory" => {
            let val: Value = serde_json::from_str(&content).ok()?;
            if opts.pretty {
                serde_json::to_string_pretty(&val).ok()
            } else {
                serde_json::to_string(&val).ok()
            }
        }
        "Source" if opts.pretty => {
            let val: Value = serde_json::from_str(&content).ok()?;
            serde_json::to_string_pretty(&val).ok()
        }
        _ => Some(content),
    }
}

fn run_lane(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("cat-lane arguments are not UTF-8".into()));
    };
    let Some(id) = parse_single_id(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native cat-lane grammar".into()));
    };
    let Ok(Some(root)) = scope_root::discover() else {
        return Ok(Outcome::Declined("cat-lane requires a scope".into()));
    };
    let scope_dir = scope_dir_for(&root);
    let Some((_, _, hash)) = resolve_lane_entry(&scope_dir, &id) else {
        if env::var_os("CI").is_none_or(|val| val.is_empty())
            && let Some(err) = diagnose_lane_lookup_error(&scope_dir, &id, false)
        {
            return emit_failure(&root, args, "cat-lane", false, false, err);
        }
        return Ok(Outcome::Declined("cat-lane lane lookup delegated".into()));
    };
    let Ok(Some((kind, mut val))) = bit_object_import::read_scope_object(&scope_dir, &hash) else {
        return Ok(Outcome::Declined("cat-lane object missing".into()));
    };
    let Some(map) = (kind == "Lane").then(|| val.as_object_mut()).flatten() else {
        return Ok(Outcome::Declined("cat-lane object invalid".into()));
    };
    map.insert("hash".into(), Value::String(hash));
    let Ok(data) = format_json_4(&val) else {
        return Ok(Outcome::Declined("cat-lane serialization failed".into()));
    };
    emit_text(&root, args, "cat-lane", false, data)
}

fn run_lane_history(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("cat-lane-history arguments are not UTF-8".into()));
    };
    let Some(id) = parse_single_id(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native cat-lane-history grammar".into()));
    };
    let Ok(Some(root)) = scope_root::discover() else {
        return Ok(Outcome::Declined("cat-lane-history requires a scope".into()));
    };
    let scope_dir = scope_dir_for(&root);
    let Some((scope, name, lane_hash)) = resolve_lane_entry(&scope_dir, &id) else {
        if env::var_os("CI").is_none_or(|val| val.is_empty())
            && let Some(err) = diagnose_lane_lookup_error(&scope_dir, &id, true)
        {
            return emit_failure(&root, args, "cat-lane-history", true, false, err);
        }
        return Ok(Outcome::Declined("cat-lane-history lane lookup delegated".into()));
    };
    let history_hash = sha1_hex(&format!("{lane_hash}:LaneHistory"));
    let val = match bit_object_import::read_scope_object(&scope_dir, &history_hash) {
        Ok(Some((kind, val))) if kind == "LaneHistory" => val,
        Ok(None) => json!({"name": name, "scope": scope, "laneHash": lane_hash, "history": {}}),
        _ => return Ok(Outcome::Declined("cat-lane-history object invalid".into())),
    };
    let Ok(data) = serde_json::to_string_pretty(&val) else {
        return Ok(Outcome::Declined("cat-lane-history serialization failed".into()));
    };
    emit_text(&root, args, "cat-lane-history", true, data)
}

fn run_version_history(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("cat-version-history arguments are not UTF-8".into()));
    };
    let Some(opts) = parse_id_json_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native cat-version-history grammar".into()));
    };
    let Ok(Some(root)) = scope_root::discover() else {
        return Ok(Outcome::Declined("cat-version-history requires a scope".into()));
    };
    let scope_dir = scope_dir_for(&root);
    let (bare_id, _) = opts.id
        .rsplit_once('@')
        .unwrap_or((&opts.id, ""));
    let Some((Some(scope), name, _)) = resolve_component_entry(&scope_dir, bare_id) else {
        if env::var_os("CI").is_none_or(|val| val.is_empty())
            && let Some(err) =
                diagnose_component_lookup_error(&scope_dir, &opts.id, bare_id, Chalk::detect(args))
        {
            return emit_failure(&root, args, "cat-version-history", true, opts.json, err);
        }
        return Ok(Outcome::Declined("cat-version-history component lookup delegated".into()));
    };
    let vh_hash = sha1_hex(&format!("{scope}/{name}:VersionHistory"));
    let mut val = match bit_object_import::read_scope_object(&scope_dir, &vh_hash) {
        Ok(Some((kind, val))) if kind == "VersionHistory" => val,
        Ok(None) => json!({
            "name": name,
            "scope": scope,
            "versions": [],
            "graphCompleteRefs": [],
        }),
        _ => return Ok(Outcome::Declined("cat-version-history object invalid".into())),
    };
    let Some(map) = val.as_object_mut() else {
        return Ok(Outcome::Declined("cat-version-history object invalid".into()));
    };
    map.insert("hash".into(), Value::String(vh_hash));
    emit_value(&root, args, "cat-version-history", opts.json, &val)
}

fn run_component(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("cat-component arguments are not UTF-8".into()));
    };
    let Some(opts) = parse_id_json_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native cat-component grammar".into()));
    };
    let Ok(Some(root)) = scope_root::discover() else {
        return Ok(Outcome::Declined("cat-component requires a scope".into()));
    };
    let scope_dir = scope_dir_for(&root);
    let Some(val) = load_cat_component(&root, &scope_dir, &opts.id) else {
        return Ok(Outcome::Declined("cat-component delegated".into()));
    };
    emit_value(&root, args, "cat-component", opts.json, &val)
}

pub(in crate::commands) fn scope_dir_for(root: &ScopeRoot) -> PathBuf {
    if root.bare { root.path.clone() } else { bit_object_import::scope_path(&root.path) }
}

pub(in crate::commands) fn sha1_hex(input: &str) -> String {
    format!("{:x}", Sha1::digest(input.as_bytes()))
}

pub(in crate::commands) fn format_json_4(val: &Value) -> io::Result<String> {
    let mut buf = Vec::new();
    let mut ser =
        serde_json::Serializer::with_formatter(&mut buf, PrettyFormatter::with_indent(b"    "));
    val.serialize(&mut ser).map_err(io::Error::other)?;
    String::from_utf8(buf).map_err(io::Error::other)
}

pub(in crate::commands) fn emit_value(
    root: &ScopeRoot,
    args: &[OsString],
    command: &str,
    json_flag: bool,
    val: &Value,
) -> io::Result<Outcome> {
    if json_flag {
        let history = (!root.bare).then(|| History::start(&root.path, args));
        let mut stdout = io::stdout().lock();
        stdout.write_all(serde_json::to_string_pretty(val)?.as_bytes())?;
        stdout.flush()?;
        if let Some(history) = history {
            history.end(true);
        }
        return Ok(Outcome::Exit(ExitCode::SUCCESS));
    }
    let data = format_json_4(val)?;
    emit_text(root, args, command, false, data)
}

pub(in crate::commands) fn emit_text(
    root: &ScopeRoot,
    args: &[OsString],
    command: &str,
    loader: bool,
    data: String,
) -> io::Result<Outcome> {
    let report = Report { data, code: 0, details: None };
    match (root.bare, loader) {
        (false, false) => execute_without_loader(&root.path, args, command, |_| Ok(report)),
        (true, false) => execute_without_loader_scope(&root.path, args, command, |_| Ok(report)),
        (false, true) => execute_then(&root.path, args, command, |_| Ok(report)),
        (true, true) => execute_with_scope(&root.path, args, command, &report),
    }
}

pub(in crate::commands) fn emit_failure(
    root: &ScopeRoot,
    args: &[OsString],
    command: &str,
    loader: bool,
    json_flag: bool,
    msg: String,
) -> io::Result<Outcome> {
    let quiet = json_flag || !loader;
    let err = io::Error::other(msg);
    if root.bare {
        execute_failure_scope(&root.path, args, command, quiet, "", err)
    } else if quiet {
        execute_without_loader(&root.path, args, command, |_| Err(err))
    } else {
        execute_then(&root.path, args, command, |_| Err(err))
    }
}

#[cfg(test)]
mod tests;

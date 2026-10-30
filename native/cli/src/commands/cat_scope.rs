//! Native `bit cat-scope [scopePath] [-f|--full] [-j|--json] [-e|--json-extra]`.

mod json;
#[cfg(test)]
mod tests;

use super::{
    Command,
    debug_cat::{emit_scope_not_found, emit_text, sha1_hex},
    lane::scope_root::{self, ScopeRoot},
    list::table,
    workspace_command,
};
use crate::{history::History, native::Outcome, workspace};
use serde_json::{Map, Value};
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "cat-scope", aliases: &[], run };

#[derive(Debug, Default, PartialEq, Eq)]
struct Options {
    scope_path: Option<String>,
    full: bool,
    json: bool,
    json_extra: bool,
}

struct ScopeEntry {
    id: String,
    hash: String,
    kind: &'static str,
    json_obj: Option<Value>,
}

fn parse_options(args: &[&str]) -> Option<Options> {
    let mut opts = Options::default();
    for &arg in args {
        apply_cat_scope_arg(&mut opts, arg)?;
    }
    Some(opts)
}

fn apply_cat_scope_arg(opts: &mut Options, arg: &str) -> Option<()> {
    match arg {
        "-f" | "--full" | "--full=true" => opts.full = true,
        "--full=false" => opts.full = false,
        "-j" | "--json" | "--json=true" => opts.json = true,
        "--json=false" => opts.json = false,
        "-e" | "--json-extra" | "--json-extra=true" => opts.json_extra = true,
        "--json-extra=false" => opts.json_extra = false,
        "-fj" | "-jf" => {
            opts.full = true;
            opts.json = true;
        }
        "-fe" | "-ef" => {
            opts.full = true;
            opts.json_extra = true;
        }
        "-je" | "-ej" => {
            opts.json = true;
            opts.json_extra = true;
        }
        "-fje" | "-fej" | "-jfe" | "-jef" | "-efj" | "-ejf" => {
            opts.full = true;
            opts.json = true;
            opts.json_extra = true;
        }
        "--no-color" | "--color" | "--color=true" | "--color=false" | "--color=always" => {}
        val if !val.starts_with('-') && opts.scope_path.is_none() => {
            opts.scope_path = Some(val.to_owned());
        }
        _ => return None,
    }
    Some(())
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("cat-scope arguments are not UTF-8".into()));
    };
    let Some(opts) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native cat-scope grammar".into()));
    };
    let cwd = env::current_dir()?;
    let target_dir = match &opts.scope_path {
        Some(raw) => cwd.join(raw),
        None => cwd,
    };
    let Some(target_scope_dir) = resolve_scope_dir(&target_dir) else {
        if opts.scope_path.is_none()
            && scope_root::discover()
                .ok()
                .flatten()
                .is_none()
        {
            return emit_scope_not_found(args, "cat-scope", true);
        }
        return Ok(Outcome::Declined("cat-scope target is not a valid scope".into()));
    };
    let Some(entries) = collect_scope_entries(&target_scope_dir, &opts) else {
        return Ok(Outcome::Declined("cat-scope delegated".into()));
    };
    let current_root = scope_root::discover()
        .ok()
        .flatten()
        .unwrap_or(ScopeRoot { path: target_scope_dir, bare: true });
    if opts.json {
        return emit_json_entries(&current_root, args, entries);
    }
    let rendered = render_text_entries(args, opts.full, entries);
    emit_text(&current_root, args, "cat-scope", false, rendered)
}

fn render_text_entries(args: &[OsString], full: bool, entries: Vec<ScopeEntry>) -> String {
    if full {
        entries
            .into_iter()
            .map(|entry| format!("> {}\n\n{}\n", entry.hash, entry.id))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        let rows = entries
            .into_iter()
            .map(|entry| vec![entry.id, format!("obj: {}", entry.hash), entry.kind.to_owned()])
            .collect::<Vec<_>>();
        table::render(&["id", "Object", "Type"], &rows, table::colors(args))
    }
}

fn emit_json_entries(
    current_root: &ScopeRoot,
    args: &[OsString],
    entries: Vec<ScopeEntry>,
) -> io::Result<Outcome> {
    let mut arr = Vec::with_capacity(entries.len());
    for entry in entries {
        let Some(obj) = entry.json_obj else {
            return Ok(Outcome::Declined("cat-scope json entry delegated".into()));
        };
        arr.push(obj);
    }
    let history = (!current_root.bare).then(|| History::start(&current_root.path, args));
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(&arr)?.as_bytes())?;
    stdout.flush()?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn resolve_scope_dir(target: &Path) -> Option<PathBuf> {
    let scope_dir = if let Some(ws_root) = workspace::root(target) {
        bit_object_import::scope_path(&ws_root)
    } else {
        target
            .ancestors()
            .find(|dir| dir.join("scope.json").is_file())?
            .to_path_buf()
    };
    if !scope_dir.join("objects").is_dir() {
        return None;
    }
    let bytes = fs::read(scope_dir.join("scope.json")).ok()?;
    let scope_json: Value = serde_json::from_slice(&bytes).ok()?;
    scope_json["name"]
        .as_str()
        .filter(|name| !name.is_empty() && !name.contains('/'))?;
    Some(scope_dir)
}

fn collect_scope_entries(scope_dir: &Path, opts: &Options) -> Option<Vec<ScopeEntry>> {
    let objects_dir = scope_dir.join("objects");
    let subdirs = sorted_hex_entries(&objects_dir, 2, true)?;
    let mut entries = Vec::new();
    for prefix in subdirs {
        let files = sorted_hex_entries(&objects_dir.join(&prefix), 38, false)?;
        for suffix in files {
            let hash = format!("{prefix}{suffix}");
            if let Some(entry) = read_index_entry(scope_dir, &hash, opts)? {
                entries.push(entry);
            }
        }
    }
    Some(entries)
}

fn sorted_hex_entries(dir: &Path, len: usize, want_dir: bool) -> Option<Vec<String>> {
    let mut names = fs::read_dir(dir)
        .ok()?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_type()
                .is_ok_and(|ft| if want_dir { ft.is_dir() } else { ft.is_file() })
        })
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.len() == len && name.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .collect::<Vec<_>>();
    names.sort();
    Some(names)
}

fn read_index_entry(scope_dir: &Path, hash: &str, opts: &Options) -> Option<Option<ScopeEntry>> {
    let (headers, body) = bit_object_import::read_raw_scope_object(scope_dir, hash).ok()??;
    match headers.first()?.as_str() {
        "Component" => {
            let raw: Value = serde_json::from_slice(&body).ok()?;
            Some(Some(build_component_entry(&raw, opts)?))
        }
        "Symlink" => {
            let raw: Value = serde_json::from_slice(&body).ok()?;
            Some(Some(build_symlink_entry(&raw, opts)?))
        }
        "Lane" => {
            let raw: Value = serde_json::from_slice(&body).ok()?;
            Some(Some(build_lane_entry(&raw, hash, opts)?))
        }
        "ScopeMeta" if opts.full => {
            let raw: Value = serde_json::from_slice(&body).ok()?;
            Some(Some(build_scope_meta_entry(&raw, hash, opts)?))
        }
        "Version" if opts.full && !opts.json => Some(Some(ScopeEntry {
            id: hash.to_owned(),
            hash: hash.to_owned(),
            kind: "Version",
            json_obj: None,
        })),
        "Version" if opts.full && opts.json => None,
        _ => Some(None),
    }
}

fn build_component_entry(raw: &Value, opts: &Options) -> Option<ScopeEntry> {
    let name = extract_boxed_name(raw)?;
    let scope = raw["scope"]
        .as_str()
        .filter(|text| !text.is_empty())?;
    let id = format!("{scope}/{name}");
    let hash = sha1_hex(&id);
    let json_obj = if opts.json {
        Some(json::build_component_json_obj(raw, scope, name, &hash, opts.json_extra)?)
    } else {
        None
    };
    Some(ScopeEntry { id, hash, kind: "Component", json_obj })
}

fn extract_boxed_name(raw: &Value) -> Option<String> {
    let base_name = raw["name"]
        .as_str()
        .filter(|text| !text.is_empty())?;
    Some(
        match raw["box"]
            .as_str()
            .filter(|text| !text.is_empty())
        {
            Some(bx) => format!("{bx}/{base_name}"),
            None => base_name.to_owned(),
        },
    )
}

fn build_symlink_entry(raw: &Value, opts: &Options) -> Option<ScopeEntry> {
    let name = extract_boxed_name(raw)?;
    let real_scope = raw["realScope"].as_str()?;
    let id = name.clone();
    let hash = sha1_hex(&id);
    let json_obj = opts.json.then(|| {
        let mut map = Map::new();
        map.insert("validateBeforePersist".into(), Value::Bool(true));
        if let Some(scope) = raw["scope"].as_str() {
            map.insert("scope".into(), Value::String(scope.to_owned()));
        }
        map.insert("name".into(), Value::String(name));
        map.insert("realScope".into(), Value::String(real_scope.to_owned()));
        if opts.json_extra {
            map.insert("hash".into(), Value::String(hash.clone()));
            map.insert("type".into(), Value::String("Symlink".into()));
        }
        Value::Object(map)
    });
    Some(ScopeEntry { id, hash, kind: "Symlink", json_obj })
}

fn build_lane_entry(raw: &Value, fallback_hash: &str, opts: &Options) -> Option<ScopeEntry> {
    let name = raw["name"]
        .as_str()
        .filter(|text| !text.is_empty())?;
    let scope = raw["scope"]
        .as_str()
        .filter(|text| !text.is_empty())?;
    let id = format!("{scope}/{name}");
    let hash = raw["hash"]
        .as_str()
        .unwrap_or(fallback_hash)
        .to_owned();
    let json_obj = if opts.json {
        Some(json::build_lane_json_obj(raw, scope, name, &hash, opts.json_extra)?)
    } else {
        None
    };
    Some(ScopeEntry { id, hash, kind: "Lane", json_obj })
}

fn build_scope_meta_entry(raw: &Value, hash: &str, opts: &Options) -> Option<ScopeEntry> {
    let name = raw["name"]
        .as_str()
        .filter(|text| !text.is_empty())?
        .to_owned();
    let json_obj = opts.json.then(|| {
        let mut map = Map::new();
        map.insert("validateBeforePersist".into(), Value::Bool(true));
        if let Some(lic) = raw
            .get("license")
            .filter(|val| !val.is_null())
        {
            map.insert("license".into(), lic.clone());
        }
        map.insert("name".into(), Value::String(name.clone()));
        if opts.json_extra {
            map.insert("hash".into(), Value::String(hash.to_owned()));
            map.insert("type".into(), Value::String("ScopeMeta".into()));
        }
        Value::Object(map)
    });
    Some(ScopeEntry { id: name, hash: hash.to_owned(), kind: "ScopeMeta", json_obj })
}

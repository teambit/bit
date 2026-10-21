//! Native `bit eject-conf <pattern> [-p|--propagate] [-o|--override] [-j|--json]` (`scopes/workspace/workspace/eject-conf.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    aspect::{find_bitmap_row_mut, is_supported_pattern, workspace_default_scope},
    color::Chalk,
    scope_set::{Failure, selection},
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{history::History, native::Outcome, workspace};
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::{Map, Value, json};
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "eject-conf", aliases: &[], run };

#[derive(Debug, Default, PartialEq, Eq)]
struct Options {
    pattern: String,
    propagate: bool,
    override_existing: bool,
    json: bool,
}

struct EjectedFile {
    abs_path: PathBuf,
    rel_path: String,
    bytes: Vec<u8>,
}

struct Prepared {
    root: PathBuf,
    files: Vec<EjectedFile>,
    bitmap_before: Vec<u8>,
    bitmap_val: Value,
    bitmap_changed: bool,
}

fn parse_options(args: &[&str]) -> Option<Options> {
    let mut opts = Options::default();
    let mut idx = 0;
    while idx < args.len() {
        match args[idx] {
            "-p" | "--propagate" => opts.propagate = consume_bool_flag(args, &mut idx),
            "-o" | "--override" => opts.override_existing = consume_bool_flag(args, &mut idx),
            "-j" | "--json" => opts.json = true,
            "--no-color" => {}
            val if !val.starts_with('-') && opts.pattern.is_empty() => {
                val.clone_into(&mut opts.pattern);
            }
            _ => return None,
        }
        idx += 1;
    }
    is_supported_pattern(&opts.pattern).then_some(opts)
}

fn consume_bool_flag(args: &[&str], idx: &mut usize) -> bool {
    match args.get(*idx + 1).copied() {
        Some("true") => {
            *idx += 1;
            true
        }
        Some("false") => {
            *idx += 1;
            false
        }
        _ => true,
    }
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("eject-conf arguments are not UTF-8".into()));
    };
    let Some(opts) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native eject-conf grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("eject-conf requires a workspace".into()));
    };
    let chalk = Chalk::detect(args);
    match prepare(&root, &opts, chalk) {
        Ok(prepared) => {
            if opts.json {
                let history = History::start(&root, args);
                let payload = prepared.write_and_json()?;
                let mut stdout = io::stdout().lock();
                stdout.write_all(serde_json::to_string_pretty(&payload)?.as_bytes())?;
                stdout.flush()?;
                history.end(true);
                return Ok(Outcome::Exit(ExitCode::SUCCESS));
            }
            workspace_command::execute_then(&root, args, "eject-conf", |_output| {
                prepared.commit(chalk)
            })
        }
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI eject-conf error stack".into()));
            }
            workspace_command::execute_then(&root, args, "eject-conf", |_output| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("eject-conf: {reason}"))),
    }
}

fn prepare(root: &Path, opts: &Options, chalk: Chalk) -> Result<Prepared, Failure> {
    if root.join("workspace-config-merge.json").exists()
        || workspace::scope_path(root).join("unmerged.json").exists()
    {
        return Err(Failure::Declined("merge state active".into()));
    }
    let workspace_bytes = fs::read(root.join("workspace.jsonc"))?;
    let bitmap_before = fs::read(root.join(".bitmap"))?;
    let workspace_val = bit_object_import::parse_jsonc(&workspace_bytes)?;
    let mut bitmap_val = bit_object_import::parse_jsonc(&bitmap_before)?;
    let default_scope = workspace_default_scope(&workspace_val)?;
    let bitmap = Bitmap::load(root, Some(&default_scope))?;
    let matched = selection::resolve_pattern_entries(root, &bitmap, &opts.pattern, chalk)?;
    let mut files = Vec::with_capacity(matched.len());
    let mut bitmap_changed = false;
    for entry in matched {
        let (file, changed) =
            prepare_entry(root, &bitmap, &mut bitmap_val, &default_scope, opts, entry)?;
        if changed {
            bitmap_changed = true;
        }
        files.push(file);
    }
    Ok(Prepared { root: root.to_path_buf(), files, bitmap_before, bitmap_val, bitmap_changed })
}

fn prepare_entry(
    root: &Path,
    bitmap: &Bitmap,
    bitmap_val: &mut Value,
    default_scope: &str,
    opts: &Options,
    entry: &BitmapEntry,
) -> Result<(EjectedFile, bool), Failure> {
    if entry.id.version
        .as_deref()
        .is_some_and(|ver| !ver.is_empty())
    {
        return Err(Failure::Declined("versioned component on eject-conf".into()));
    }
    if entry.root_dir.is_empty() {
        return Err(Failure::Declined("empty root_dir on eject-conf".into()));
    }
    let abs_path = root.join(&entry.root_dir).join("component.json");
    validate_existing_comp_json(&abs_path, opts.override_existing)?;
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    let extensions = build_ejected_extensions(bitmap, row.get("config"))?;
    let changed = row
        .as_object_mut()
        .is_some_and(|row_obj| row_obj.remove("config").is_some());
    let scope = entry.id.scope
        .as_deref()
        .filter(|text| !text.is_empty())
        .unwrap_or(default_scope);
    let comp_json = json!({
        "componentId": { "scope": scope, "name": entry.id.name },
        "propagate": opts.propagate,
        "extensions": extensions,
    });
    let rendered = format!(
        "{}\n",
        serde_json::to_string_pretty(&comp_json).map_err(|err| Failure::Declined(err.to_string()))?,
    );
    let rel_path = Path::new(&entry.root_dir)
        .join("component.json")
        .to_string_lossy()
        .into_owned();
    Ok((EjectedFile { abs_path, rel_path, bytes: rendered.into_bytes() }, changed))
}

fn validate_existing_comp_json(abs_path: &Path, override_existing: bool) -> Result<(), Failure> {
    if !abs_path.exists() {
        return Ok(());
    }
    if !override_existing {
        return Err(Failure::User(format!(
            "config file at {} already exists. use override in case you want to override it",
            abs_path.display(),
        )));
    }
    let existing: Value = serde_json::from_slice(&fs::read(abs_path)?)
        .map_err(|err| Failure::Declined(err.to_string()))?;
    if existing["extensions"]
        .as_object()
        .is_none_or(|ext| !ext.is_empty())
    {
        return Err(Failure::Declined("non-empty existing component.json".into()));
    }
    Ok(())
}

fn build_ejected_extensions(bitmap: &Bitmap, raw_cfg: Option<&Value>) -> Result<Value, Failure> {
    let mut out = Map::new();
    let Some(cfg_obj) = raw_cfg.and_then(Value::as_object) else {
        return Ok(Value::Object(out));
    };
    let env_bare = cfg_obj
        .get("teambit.envs/envs")
        .and_then(|val| val["env"].as_str())
        .filter(|text| !text.is_empty());
    let local_env = env_bare.filter(|bare| {
        bitmap.entries
            .iter()
            .any(|entry| entry.owns_its_dir() && entry.id.to_string_without_version() == *bare)
    });
    for (key, val) in cfg_obj {
        if val.as_str() == Some("-") {
            continue;
        }
        let target_key = match local_env {
            Some(bare) if key.starts_with(&format!("{bare}@")) => bare.to_owned(),
            _ => key.clone(),
        };
        out.insert(target_key, val.clone());
    }
    Ok(Value::Object(out))
}

impl Prepared {
    fn write_files(&self) -> io::Result<()> {
        for file in &self.files {
            if let Some(parent) = file.abs_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&file.abs_path, &file.bytes)?;
        }
        if self.bitmap_changed {
            let file_id = workspace_command::file_id();
            bit_object_import::component_deprecation::write_bitmap(
                &self.root,
                &self.bitmap_before,
                &self.bitmap_val,
                &file_id,
                &format!("eject-conf ({} component(s))", self.files.len()),
            )?;
        }
        Ok(())
    }

    fn write_and_json(self) -> io::Result<Value> {
        self.write_files()?;
        let arr = self.files
            .into_iter()
            .map(|file| json!({ "configPath": file.abs_path.to_string_lossy() }))
            .collect::<Vec<_>>();
        Ok(Value::Array(arr))
    }

    fn commit(self, chalk: Chalk) -> io::Result<Report> {
        self.write_files()?;
        let formatter = Formatter::new(chalk);
        let items = self.files
            .iter()
            .map(|file| formatter.item(&file.rel_path))
            .collect::<Vec<_>>();
        let data = format!(
            "{}\n{}",
            formatter.success_summary("ejected config to the following path(s)"),
            items.join("\n"),
        );
        Ok(Report { data, code: 0, details: None })
    }
}

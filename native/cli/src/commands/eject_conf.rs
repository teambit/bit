//! Native `bit eject-conf <pattern> [-p|--propagate] [-o|--override] [-j|--json]` (`scopes/workspace/workspace/eject-conf.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    aspect::{CORE_ASPECT_IDS, find_bitmap_row_mut, is_supported_pattern, workspace_default_scope},
    color::Chalk,
    scope_set::{Failure, selection},
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{history::History, native::Outcome, workspace};
use bit_install::{
    model::ComponentId,
    workspace::{
        Bitmap, BitmapEntry, ScopeObjects,
        aspects::{self, Merger, Origin, Resolver},
    },
};
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

struct PrepareCtx<'a> {
    root: &'a Path,
    bitmap: &'a Bitmap,
    default_scope: &'a str,
    opts: &'a Options,
    objects: ScopeObjects,
    core_ids: Vec<String>,
    ws_ids: Vec<ComponentId>,
}

fn parse_options(args: &[&str]) -> Option<Options> {
    let mut opts = Options::default();
    let mut idx = 0;
    while idx < args.len() {
        match args[idx] {
            "--" => {
                super::eject::consume_trailing_eject(
                    args[idx + 1..].iter().copied(),
                    &mut opts.pattern,
                )?;
                break;
            }
            "-p" | "--propagate" => opts.propagate = consume_bool_flag(args, &mut idx),
            "--propagate=true" => opts.propagate = true,
            "--propagate=false" => opts.propagate = false,
            "-o" | "--override" => opts.override_existing = consume_bool_flag(args, &mut idx),
            "--override=true" => opts.override_existing = true,
            "--override=false" => opts.override_existing = false,
            "-j" | "--json" | "--json=true" => opts.json = true,
            "--json=false" => opts.json = false,
            "--no-color" => {}
            val if !val.starts_with('-') && !val.is_empty() && opts.pattern.is_empty() => {
                val.clone_into(&mut opts.pattern);
            }
            val => apply_short_flags(val, &mut opts)?,
        }
        idx += 1;
    }
    is_supported_pattern(&opts.pattern).then_some(opts)
}

fn apply_short_flags(arg: &str, opts: &mut Options) -> Option<()> {
    let flags = arg
        .strip_prefix('-')
        .filter(|flags| !flags.is_empty() && !flags.starts_with('-'))?;
    for ch in flags.chars() {
        match ch {
            'p' => opts.propagate = true,
            'o' => opts.override_existing = true,
            'j' => opts.json = true,
            _ => return None,
        }
    }
    Some(())
}

fn consume_bool_flag(args: &[&str], idx: &mut usize) -> bool {
    if let Some(val @ ("true" | "false")) = args.get(*idx + 1).copied() {
        *idx += 1;
        return val == "true";
    }
    true
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("eject-conf arguments are not UTF-8".into()));
    };
    let Some(opts) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native eject-conf grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return super::lint_cmd::emit_pattern_error(
            &cwd,
            args,
            "eject-conf",
            opts.json,
            crate::commands::log::OUTSIDE_WORKSPACE_ERR.into(),
        );
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
            super::lint_cmd::emit_pattern_error(&root, args, "eject-conf", opts.json, message)
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
    let ctx = build_prepare_ctx(root, &bitmap, &default_scope, opts)?;
    let (files, bitmap_changed) = prepare_selected(&ctx, &mut bitmap_val, &matched)?;
    Ok(Prepared { root: root.to_path_buf(), files, bitmap_before, bitmap_val, bitmap_changed })
}

fn prepare_selected(
    ctx: &PrepareCtx<'_>,
    bitmap_val: &mut Value,
    matched: &[&BitmapEntry],
) -> Result<(Vec<EjectedFile>, bool), Failure> {
    let mut files = Vec::with_capacity(matched.len());
    let mut bitmap_changed = false;
    for entry in matched {
        let (file, changed) = prepare_entry(ctx, bitmap_val, entry)?;
        bitmap_changed |= changed;
        files.push(file);
    }
    Ok((files, bitmap_changed))
}

fn build_prepare_ctx<'a>(
    root: &'a Path,
    bitmap: &'a Bitmap,
    default_scope: &'a str,
    opts: &'a Options,
) -> Result<PrepareCtx<'a>, Failure> {
    let core_ids =
        serde_json::from_str(CORE_ASPECT_IDS).map_err(|err| Failure::Declined(err.to_string()))?;
    let ws_ids = bitmap.entries
        .iter()
        .map(|entry| entry.id.clone())
        .collect();
    let objects = ScopeObjects::new(&workspace::scope_path(root));
    Ok(PrepareCtx { root, bitmap, default_scope, opts, objects, core_ids, ws_ids })
}

fn prepare_entry(
    ctx: &PrepareCtx<'_>,
    bitmap_val: &mut Value,
    entry: &BitmapEntry,
) -> Result<(EjectedFile, bool), Failure> {
    if entry.root_dir.is_empty() {
        return Err(Failure::Declined("empty root_dir on eject-conf".into()));
    }
    let abs_path = ctx.root.join(&entry.root_dir).join("component.json");
    let existing = load_existing_comp_json(&abs_path, ctx.opts.override_existing)?;
    let scope = entry.id.scope
        .as_deref()
        .filter(|text| !text.is_empty())
        .unwrap_or(ctx.default_scope);
    let row = find_bitmap_row_mut(bitmap_val, entry)?;
    let exts = build_ejected_extensions(ctx, entry, scope, row.get("config"), existing.as_ref())?;
    let changed = row
        .as_object_mut()
        .is_some_and(|obj| obj.remove("config").is_some());
    Ok((render_ejected_file(&abs_path, entry, scope, ctx.opts, &exts)?, changed))
}

fn render_ejected_file(
    abs_path: &Path,
    entry: &BitmapEntry,
    scope: &str,
    opts: &Options,
    extensions: &Value,
) -> Result<EjectedFile, Failure> {
    let comp_id = match entry.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())
    {
        Some(ver) => json!({ "scope": scope, "name": entry.id.name, "version": ver }),
        None => json!({ "scope": scope, "name": entry.id.name }),
    };
    let comp_json =
        json!({ "componentId": comp_id, "propagate": opts.propagate, "extensions": extensions });
    let json_str =
        serde_json::to_string_pretty(&comp_json).map_err(|err| Failure::Declined(err.to_string()))?;
    let rel_path = Path::new(&entry.root_dir)
        .join("component.json")
        .to_string_lossy()
        .into_owned();
    Ok(EjectedFile {
        abs_path: abs_path.to_path_buf(),
        rel_path,
        bytes: format!("{json_str}\n").into_bytes(),
    })
}

fn load_existing_comp_json(
    abs_path: &Path,
    override_existing: bool,
) -> Result<Option<Value>, Failure> {
    if !abs_path.exists() {
        return Ok(None);
    }
    if !override_existing {
        return Err(Failure::User(format!(
            "config file at {} already exists. use override in case you want to override it",
            abs_path.display(),
        )));
    }
    let existing: Value = serde_json::from_slice(&fs::read(abs_path)?)
        .map_err(|err| Failure::Declined(err.to_string()))?;
    let comp_id = existing["componentId"]
        .as_object()
        .ok_or_else(|| Failure::Declined("missing componentId in component.json".into()))?;
    let invalid = ["scope", "name"]
        .iter()
        .any(|key| {
            comp_id
                .get(*key)
                .and_then(Value::as_str)
                .is_none_or(str::is_empty)
        })
        || existing.get("defaultScope").is_some()
        || !existing["extensions"].is_object();
    (!invalid)
        .then_some(Some(existing))
        .ok_or_else(|| Failure::Declined("invalid existing component.json".into()))
}

fn build_ejected_extensions(
    ctx: &PrepareCtx<'_>,
    entry: &BitmapEntry,
    scope: &str,
    raw_cfg: Option<&Value>,
    existing: Option<&Value>,
) -> Result<Value, Failure> {
    let model_exts = load_version_extensions(&ctx.objects, scope, entry)?;
    let mut merger = Merger::new(Resolver { component: &entry.id, workspace: &ctx.ws_ids });
    if let Some(cfg_obj) = raw_cfg.and_then(Value::as_object) {
        merger.add(aspects::from_config_object(cfg_obj, &ctx.core_ids), Origin::BitmapFile);
    }
    if let Some(ext_obj) = existing.and_then(|val| val["extensions"].as_object()) {
        merger.add(aspects::from_config_object(ext_obj, &ctx.core_ids), Origin::ComponentJsonFile);
    }
    let continue_propagating = existing.is_none_or(|val| val["propagate"] == true);
    if !model_exts.is_empty() {
        let (specific, non_specific): (Vec<_>, Vec<_>) =
            aspects::from_model(&model_exts).into_iter().partition(aspects::is_specific);
        merger.add(specific, Origin::ModelSpecific);
        if continue_propagating {
            merger.add(non_specific, Origin::ModelNonSpecific);
        }
    }
    let merged = merger.finish();
    let cfg_map = aspects::to_config(&merged);
    Ok(Value::Object(strip_local_env_version(ctx.bitmap, cfg_map)))
}

fn load_version_extensions(
    objects: &ScopeObjects,
    scope: &str,
    entry: &BitmapEntry,
) -> Result<Vec<Value>, Failure> {
    let Some(ver) = entry.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())
    else {
        return Ok(Vec::new());
    };
    let ver_hash = if ver.len() == 40 && ver.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        ver.to_owned()
    } else {
        let model = super::lint_cmd::read_model_object(objects, scope, &entry.id.name)?;
        model["versions"]
            .get(ver)
            .and_then(Value::as_str)
            .map(str::to_owned)
            .ok_or_else(|| Failure::Declined("missing version in model on eject-conf".into()))?
    };
    let version_obj = objects
        .read(&ver_hash)
        .map_err(|err| Failure::Declined(err.to_string()))?
        .ok_or_else(|| Failure::Declined("missing version object on eject-conf".into()))?;
    Ok(version_obj["extensions"]
        .as_array()
        .cloned()
        .unwrap_or_default())
}

fn strip_local_env_version(bitmap: &Bitmap, cfg_map: Map<String, Value>) -> Map<String, Value> {
    let local_env = cfg_map
        .iter()
        .find(|(key, _)| {
            key.as_str() == "teambit.envs/envs" || key.starts_with("teambit.envs/envs@")
        })
        .and_then(|(_, val)| val["env"].as_str())
        .map(|env| env.split('@').next().unwrap_or(env))
        .filter(|bare| {
            !bare.is_empty()
                && bitmap.entries
                    .iter()
                    .any(|entry| {
                        entry.owns_its_dir() && entry.id.to_string_without_version() == *bare
                    })
        })
        .map(str::to_owned);
    cfg_map
        .into_iter()
        .filter(|(_, val)| val.as_str() != Some("-"))
        .map(|(key, val)| match local_env.as_deref() {
            Some(bare) if key.starts_with(&format!("{bare}@")) => (bare.to_owned(), val),
            _ => (key, val),
        })
        .collect()
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

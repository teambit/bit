//! Native component tarball packer (`scopes/pkg/pkg/packer.ts`).

use super::{Options, format_pack_report};
use crate::{
    commands::{
        aspect::workspace_default_scope,
        color::Chalk,
        debug_cat::lookup::resolve_component_entry,
        workspace_command::{self, results::Report},
    },
    native::Outcome,
    workspace,
};
use bit_install::{
    policy::scope::{hex_sha1, is_hash},
    workspace::Bitmap,
};
use bit_object_import::parse_jsonc;
use serde_json::{Value, json};
use std::{
    ffi::OsString,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    process::ExitCode,
};

struct ResolvedComponent {
    id_display: String,
    scope_name: String,
    comp_name: String,
    version: String,
    main_file: String,
    files: Vec<(String, Vec<u8>)>,
}

pub(super) fn try_pack(
    cwd: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<Option<Outcome>> {
    let ws_root = workspace::root(cwd);
    let Some(scope_dir) = resolve_target_scope(cwd, ws_root.as_deref(), options) else {
        return super::missing_scope_error(ws_root.as_deref().unwrap_or(cwd), args, options.json)
            .map(Some);
    };
    let Some(comp) = resolve_component(ws_root.as_deref(), &scope_dir, &options.comp_id) else {
        return Ok(None);
    };
    let payload = execute_pack(cwd, &comp, options)?;
    let host_dir = ws_root.as_deref().unwrap_or(cwd);
    if options.json {
        let mut stdout = io::stdout().lock();
        stdout.write_all(serde_json::to_string_pretty(&payload)?.as_bytes())?;
        stdout.flush()?;
        return Ok(Some(Outcome::Exit(ExitCode::SUCCESS)));
    }
    let chalk = Chalk::detect(args);
    let data = format_pack_report(&payload, chalk);
    workspace_command::execute_without_loader_scope(host_dir, args, "pack", move |_| {
        Ok(Report { data, code: 0, details: None })
    })
    .map(Some)
}

fn resolve_target_scope(cwd: &Path, ws_root: Option<&Path>, options: &Options) -> Option<PathBuf> {
    let dir = match (&options.scope_path, ws_root) {
        (Some(raw), _) => cwd.join(raw),
        (None, Some(root)) => return Some(workspace::scope_path(root)),
        (None, None) => cwd.to_path_buf(),
    };
    if dir.join("scope.json").is_file() || dir.join("objects").is_dir() {
        Some(dir)
    } else {
        let scope_dir = workspace::scope_path(&dir);
        scope_dir.is_dir().then_some(scope_dir)
    }
}

fn resolve_component(
    ws_root: Option<&Path>,
    scope_dir: &Path,
    raw_id: &str,
) -> Option<ResolvedComponent> {
    let (bare_id, explicit_ver) = raw_id
        .rsplit_once('@')
        .map_or((raw_id, None), |(id, ver)| (id, Some(ver)));
    if let Some(root) = ws_root
        && let Some(comp) = resolve_from_workspace(root, bare_id, explicit_ver, raw_id)
    {
        return Some(comp);
    }
    resolve_from_scope(scope_dir, bare_id, explicit_ver, raw_id)
}

fn resolve_from_workspace(
    root: &Path,
    bare_id: &str,
    explicit_ver: Option<&str>,
    raw_id: &str,
) -> Option<ResolvedComponent> {
    let ws_val = parse_jsonc(&fs::read(root.join("workspace.jsonc")).ok()?).ok()?;
    let default_scope = workspace_default_scope(&ws_val).ok();
    let bitmap = Bitmap::load(root, default_scope.as_deref()).ok()?;
    let normalized = bare_id.trim_start_matches("./").trim_end_matches('/');
    let entry = bitmap.entries
        .iter()
        .find(|entry| {
            entry.owns_its_dir()
                && (entry.id.to_string_without_version() == bare_id
                    || entry.id.name == bare_id
                    || entry.key == bare_id
                    || (!entry.root_dir.is_empty()
                        && entry.root_dir.trim_end_matches('/') == normalized))
        })?;
    let scope_name = entry.id.scope
        .as_deref()
        .or(default_scope.as_deref())
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .unwrap_or("my-scope")
        .to_owned();
    let version = explicit_ver
        .or_else(|| {
            entry.id.version
                .as_deref()
                .filter(|ver| !ver.is_empty())
        })
        .unwrap_or("0.0.1")
        .to_owned();
    let comp_dir = root.join(&entry.root_dir);
    let mut files = Vec::new();
    collect_dir_files(&comp_dir, &comp_dir, &mut files).ok()?;
    Some(ResolvedComponent {
        id_display: raw_id.to_owned(),
        scope_name,
        comp_name: entry.id.name.clone(),
        version,
        main_file: entry.main_file.clone(),
        files,
    })
}

fn collect_dir_files(base: &Path, curr: &Path, out: &mut Vec<(String, Vec<u8>)>) -> io::Result<()> {
    if !curr.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(curr)?.flatten() {
        let name = entry.file_name();
        if name == "node_modules" || name == ".git" {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            collect_dir_files(base, &path, out)?;
        } else if path.is_file()
            && let Ok(rel) = path.strip_prefix(base)
        {
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            out.push((rel_str, fs::read(&path)?));
        }
    }
    Ok(())
}

fn read_typed_scope_object(scope_dir: &Path, hash: &str, expected: &str) -> Option<Value> {
    let (kind, val) = bit_object_import::read_scope_object(scope_dir, hash).ok().flatten()?;
    (kind == expected).then_some(val)
}

fn resolve_from_scope(
    scope_dir: &Path,
    bare_id: &str,
    explicit_ver: Option<&str>,
    raw_id: &str,
) -> Option<ResolvedComponent> {
    let (scope_opt, comp_name, comp_hash) = resolve_component_entry(scope_dir, bare_id)?;
    let comp_val = read_typed_scope_object(scope_dir, &comp_hash, "Component")?;
    let (version, ver_hash) = resolve_scope_version(&comp_val, explicit_ver)?;
    let ver_val = read_typed_scope_object(scope_dir, &ver_hash, "Version")?;
    let scope_name = scope_opt
        .as_deref()
        .or_else(|| comp_val["scope"].as_str())
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .unwrap_or("my-scope")
        .to_owned();
    let main_file = ver_val["mainFile"]
        .as_str()
        .map(str::trim)
        .filter(|main| !main.is_empty())
        .unwrap_or("index.js")
        .to_owned();
    Some(ResolvedComponent {
        id_display: raw_id.to_owned(),
        scope_name,
        comp_name,
        version,
        main_file,
        files: load_version_files(scope_dir, &ver_val),
    })
}

fn resolve_scope_version(comp_val: &Value, explicit_ver: Option<&str>) -> Option<(String, String)> {
    if let Some(req) =
        explicit_ver.filter(|ver| !ver.is_empty() && !matches!(*ver, "latest" | "head"))
    {
        if let Some(hash) = comp_val["versions"]
            .get(req)
            .and_then(Value::as_str)
            .or_else(|| comp_val["orphanedVersions"].get(req).and_then(Value::as_str))
        {
            return Some((req.to_owned(), hash.to_owned()));
        }
        if is_hash(req) {
            return Some((req.to_owned(), req.to_owned()));
        }
        return None;
    }
    let head = comp_val["head"].as_str()?;
    let tag = crate::commands::show_cmd::remote_show::find_tag_for_hash(comp_val, head)
        .unwrap_or_else(|| head.to_owned());
    Some((tag, head.to_owned()))
}

fn load_version_files(scope_dir: &Path, ver_val: &Value) -> Vec<(String, Vec<u8>)> {
    ver_val["files"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let rel = item["relativePath"].as_str()?;
                    let hash = item["file"].as_str()?;
                    let (_, bytes) =
                        bit_object_import::read_raw_scope_object(scope_dir, hash).ok()??;
                    Some((rel.to_owned(), bytes))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn execute_pack(cwd: &Path, comp: &ResolvedComponent, options: &Options) -> io::Result<Value> {
    if is_hash(&comp.version) {
        let warn = format!(
            r#""package.json at {}" contain a snap version which is not a valid semver, can't pack it"#,
            cwd.display(),
        );
        return Ok(json!({
            "id": comp.id_display,
            "warnings": [warn],
            "errors": [],
            "startTime": 1,
            "endTime": 2,
        }));
    }
    let (tar_name, tar_path) = resolve_tar_destination(cwd, comp, options.out_dir.as_deref());
    let pkg_name = format!("@{}/{}", comp.scope_name, comp.comp_name.replace('/', "."));
    let pkg_json = json!({ "name": pkg_name, "version": comp.version, "main": comp.main_file });
    write_tarball_and_build_result(comp, &pkg_json, &tar_name, &tar_path, options.override_existing)
}

fn resolve_tar_destination(
    cwd: &Path,
    comp: &ResolvedComponent,
    out_dir: Option<&str>,
) -> (String, PathBuf) {
    let tar_name =
        format!("{}-{}-{}.tgz", comp.scope_name, comp.comp_name.replace('/', "-"), comp.version);
    let dir_str = out_dir
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
        .unwrap_or(".");
    let out_base =
        if Path::new(dir_str).is_absolute() { PathBuf::from(dir_str) } else { cwd.join(dir_str) };
    (tar_name.clone(), out_base.join(tar_name))
}

fn write_tarball_and_build_result(
    comp: &ResolvedComponent,
    pkg_json: &Value,
    tar_name: &str,
    tar_path: &Path,
    override_existing: bool,
) -> io::Result<Value> {
    let mut warnings = Vec::new();
    let mut errors = Vec::new();
    if tar_path.exists() {
        if override_existing {
            warnings.push(format!(r#""{}" already exists, override it"#, tar_path.display()));
            let _ = fs::remove_file(tar_path);
        } else {
            errors.push(format!(
                r#""{}" already exists, use --override flag to override"#,
                tar_path.display(),
            ));
        }
    }
    let mut metadata = json!({
        "pkgJson": pkg_json,
        "tarPath": tar_path.to_string_lossy(),
        "tarName": tar_name,
    });
    if errors.is_empty() {
        if let Some(parent) = tar_path
            .parent()
            .filter(|dir| !dir.as_os_str().is_empty())
        {
            fs::create_dir_all(parent)?;
        }
        let tgz_bytes = build_tgz_bytes(pkg_json, &comp.files)?;
        metadata["checksum"] = Value::String(hex_sha1(&tgz_bytes));
        fs::write(tar_path, &tgz_bytes)?;
    }
    Ok(json!({
        "id": comp.id_display,
        "metadata": metadata,
        "warnings": warnings,
        "errors": errors,
        "startTime": 1,
        "endTime": 2,
    }))
}

pub(super) fn build_tgz_bytes(
    pkg_json: &Value,
    files: &[(String, Vec<u8>)],
) -> io::Result<Vec<u8>> {
    let mut builder = tar::Builder::new(Vec::new());
    let pkg_bytes = serde_json::to_vec_pretty(pkg_json).map_err(io::Error::other)?;
    append_tar_entry(&mut builder, "package/package.json", &pkg_bytes)?;
    for (rel_path, content) in files {
        if rel_path != "package.json" {
            let entry_path = format!("package/{}", rel_path.trim_start_matches('/'));
            append_tar_entry(&mut builder, &entry_path, content)?;
        }
    }
    let tar_bytes = builder.into_inner()?;
    Ok(gzip_stored(&tar_bytes))
}

fn append_tar_entry(
    builder: &mut tar::Builder<Vec<u8>>,
    path: &str,
    content: &[u8],
) -> io::Result<()> {
    let mut header = tar::Header::new_gnu();
    header.set_size(content.len() as u64);
    header.set_mode(0o644);
    header.set_cksum();
    builder.append_data(&mut header, path, content)
}

fn gzip_stored(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len() + 32);
    out.extend_from_slice(&[0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff]);
    let chunks: Vec<&[u8]> =
        if data.is_empty() { vec![&[]] } else { data.chunks(65_535).collect() };
    for (idx, chunk) in chunks.iter().enumerate() {
        let is_last = u8::from(idx + 1 == chunks.len());
        let len = u16::try_from(chunk.len()).unwrap_or(0);
        let nlen = !len;
        out.push(is_last);
        out.extend_from_slice(&len.to_le_bytes());
        out.extend_from_slice(&nlen.to_le_bytes());
        out.extend_from_slice(chunk);
    }
    let crc = crc32(data);
    let isize_val = u32::try_from(data.len() & 0xffff_ffff).unwrap_or(0);
    out.extend_from_slice(&crc.to_le_bytes());
    out.extend_from_slice(&isize_val.to_le_bytes());
    out
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for &byte in data {
        crc ^= u32::from(byte);
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
}

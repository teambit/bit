//! Remote and scope-level component loading for native `bit show`.

pub(super) use super::render_remote_outcome;
use super::{
    Options,
    deps::{DepEntry, Identity},
    deps_policy::apply_version_dependencies,
    workspace_show::LoadedComponent,
};
use crate::{
    commands::{debug_cat::lookup::resolve_component_entry, status::cache},
    native::Outcome,
    workspace,
};
use bit_install::{
    config::aspect_id_without_version,
    model::{ComponentId, WorkspaceComponent},
    workspace::{BitmapEntry, LaneFlags, ModelData, sha1_hex},
};
use serde_json::{Map, Value};
use std::{
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

const ENVS_ASPECT: &str = "teambit.envs/envs";
const REMOVE_ASPECT: &str = "teambit.component/remove";

pub(super) fn try_run(
    cwd: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<Option<Outcome>> {
    if !options.remote || options.compare || options.browser {
        return Ok(None);
    }
    let Some((scope_name, comp_name, explicit_ver)) = split_remote_id(&options.id) else {
        return Ok(None);
    };
    let Some(remote_dir) = resolve_remote_scope_dir(cwd, scope_name) else {
        return Ok(None);
    };
    let Some(loaded) = load_scope_component(&remote_dir, Some(scope_name), comp_name, explicit_ver)
    else {
        return Ok(None);
    };
    render_remote_outcome(cwd, args, options, &loaded)
}

pub(super) fn load_from_local_scope(scope_dir: &Path, raw_id: &str) -> Option<LoadedComponent> {
    let raw_id = raw_id.trim();
    let (bare_id, explicit_ver) = raw_id
        .rsplit_once('@')
        .map_or((raw_id, None), |(id, ver)| (id.trim(), Some(ver.trim())));
    if bare_id.is_empty() || explicit_ver == Some("") {
        return None;
    }
    load_scope_component(scope_dir, None, bare_id, explicit_ver)
}

pub(super) fn remote_has_version(root: &Path, scope_name: &str, name: &str, ver: &str) -> bool {
    let Some(remote_dir) = resolve_remote_scope_dir(root, scope_name) else {
        return false;
    };
    let bare_id = format!("{scope_name}/{name}");
    let comp_hash = resolve_component_entry(&remote_dir, &bare_id)
        .map_or_else(|| sha1_hex(&bare_id), |(_, _, hash)| hash);
    let Some((kind, comp_val)) =
        bit_object_import::read_scope_object(&remote_dir, &comp_hash).ok().flatten()
    else {
        return false;
    };
    kind == "Component" && resolve_scope_version(&comp_val, Some(ver)).is_some()
}

fn split_remote_id(raw_id: &str) -> Option<(&str, &str, Option<&str>)> {
    let raw_id = raw_id.trim().trim_matches('/');
    if raw_id.starts_with('@') {
        return None;
    }
    let (bare_id, explicit_ver) = raw_id
        .rsplit_once('@')
        .map_or((raw_id, None), |(id, ver)| (id.trim(), Some(ver.trim())));
    if explicit_ver == Some("") {
        return None;
    }
    let (scope_name, comp_name) = bare_id.split_once('/')?;
    let (scope_name, comp_name) = (scope_name.trim(), comp_name.trim().trim_matches('/'));
    if scope_name.is_empty() || comp_name.is_empty() || comp_name.contains("//") {
        return None;
    }
    Some((scope_name, comp_name, explicit_ver))
}

fn resolve_remote_scope_dir(cwd: &Path, scope_name: &str) -> Option<PathBuf> {
    if let Some(url) = lookup_local_scope_remote(cwd, scope_name) {
        return local_scope_from_url(&url);
    }
    if let Some(url) = lookup_global_remote(scope_name) {
        return local_scope_from_url(&url);
    }
    let base = workspace::root(cwd).unwrap_or_else(|| cwd.to_path_buf());
    let sibling = base.parent()?.join(scope_name);
    sibling
        .join("objects")
        .is_dir()
        .then_some(sibling)
}

fn lookup_local_scope_remote(cwd: &Path, scope_name: &str) -> Option<String> {
    let scope_json_path = if let Some(ws_root) = workspace::root(cwd) {
        workspace::scope_path(&ws_root).join("scope.json")
    } else {
        cwd.join("scope.json")
    };
    let parsed = bit_object_import::parse_jsonc(&fs::read(scope_json_path).ok()?).ok()?;
    parsed["remotes"][scope_name].as_str().map(str::to_owned)
}

fn lookup_global_remote(scope_name: &str) -> Option<String> {
    let path = cache::cache_root().join("config").join("global-remotes.json");
    let parsed = bit_object_import::parse_jsonc(&fs::read(path).ok()?).ok()?;
    parsed[scope_name].as_str().map(str::to_owned)
}

fn local_scope_from_url(url: &str) -> Option<PathBuf> {
    let url = url.trim();
    if url.is_empty()
        || url.starts_with("http://")
        || url.starts_with("https://")
        || url.starts_with("ssh://")
    {
        return None;
    }
    let path = PathBuf::from(url.strip_prefix("file://").unwrap_or(url));
    path.join("objects")
        .is_dir()
        .then_some(path)
}

pub(super) fn load_scope_component(
    scope_dir: &Path,
    scope_hint: Option<&str>,
    comp_name: &str,
    explicit_ver: Option<&str>,
) -> Option<LoadedComponent> {
    let bare_id = scope_hint
        .filter(|scope| !scope.is_empty())
        .map_or_else(|| comp_name.to_owned(), |scope| format!("{scope}/{comp_name}"));
    let (idx_scope, resolved_name, comp_hash) = resolve_component_entry(scope_dir, &bare_id)
        .or_else(|| resolve_component_entry(scope_dir, comp_name))
        .unwrap_or_else(|| {
            (scope_hint.map(str::to_owned), comp_name.to_owned(), sha1_hex(&bare_id))
        });
    let (kind, comp_val) =
        bit_object_import::read_scope_object(scope_dir, &comp_hash).ok().flatten()?;
    if kind != "Component" {
        return None;
    }
    let (version_str, ver_hash) = resolve_scope_version(&comp_val, explicit_ver)?;
    let (ver_kind, ver_val) =
        bit_object_import::read_scope_object(scope_dir, &ver_hash).ok().flatten()?;
    if ver_kind != "Version" {
        return None;
    }
    let scope = comp_val["scope"]
        .as_str()
        .or(idx_scope.as_deref())
        .or(scope_hint)
        .unwrap_or_default()
        .to_owned();
    let name = comp_val["name"]
        .as_str()
        .unwrap_or(&resolved_name)
        .to_owned();
    Some(build_loaded_from_version(&comp_val, &ver_val, scope, &name, version_str))
}

fn build_loaded_from_version(
    comp_val: &Value,
    ver_val: &Value,
    scope: String,
    name: &str,
    version_str: String,
) -> LoadedComponent {
    let main_file = ver_val["mainFile"]
        .as_str()
        .unwrap_or("index.js")
        .to_owned();
    let files = extract_version_files(ver_val);
    let extensions = ver_val["extensions"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let binding_prefix = comp_val["bindingPrefix"].as_str().map(str::to_owned);
    let model = ModelData { binding_prefix, extensions: extensions.clone(), files: files.clone() };
    let comp_id = ComponentId {
        scope: (!scope.is_empty()).then(|| scope.clone()),
        default_scope: None,
        name: name.to_owned(),
        version: Some(version_str),
    };
    let package_name = model.package_name(&comp_id);
    let is_removed = check_is_removed(&extensions);
    let identity = Identity { scope: &scope, name, package_name: &package_name };
    let mut deps: Vec<DepEntry> = Vec::new();
    apply_version_dependencies(ver_val, &model, &identity, &mut deps);
    let entry = make_remote_bitmap_entry(&comp_id, &main_file);
    let component = make_remote_workspace_component(
        comp_id,
        files,
        main_file.clone(),
        package_name,
        &extensions,
    );
    LoadedComponent {
        entry,
        component,
        scope,
        main_file,
        deps,
        model_extensions: extensions,
        is_removed,
    }
}

fn make_remote_bitmap_entry(comp_id: &ComponentId, main_file: &str) -> BitmapEntry {
    BitmapEntry {
        key: comp_id.to_string_without_version(),
        id: comp_id.clone(),
        root_dir: String::new(),
        main_file: main_file.to_owned(),
        config: None,
        lanes: LaneFlags {
            on_lanes_only: false,
            local_only: false,
            available_on_current_lane: true,
        },
        next_version: None,
    }
}

fn make_remote_workspace_component(
    comp_id: ComponentId,
    files: Vec<String>,
    main_file: String,
    package_name: String,
    extensions: &[Value],
) -> WorkspaceComponent {
    WorkspaceComponent {
        id: comp_id,
        root_dir: String::new(),
        dir: PathBuf::new(),
        files,
        main_file,
        env_id: extract_env_id(extensions),
        is_env: false,
        package_name,
        config: extract_config_map(extensions),
        has_package_json: false,
    }
}

pub(in crate::commands) fn resolve_scope_version(
    comp_val: &Value,
    explicit_ver: Option<&str>,
) -> Option<(String, String)> {
    if let Some(req) =
        explicit_ver.filter(|ver| !ver.is_empty() && !matches!(*ver, "latest" | "head"))
    {
        if let Some(hash) = comp_val["versions"].get(req).and_then(Value::as_str) {
            return Some((req.to_owned(), hash.to_owned()));
        }
        if let Some(hash) = comp_val["orphanedVersions"].get(req).and_then(Value::as_str) {
            return Some((req.to_owned(), hash.to_owned()));
        }
        if req.len() == 40 && req.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            let tag = find_tag_for_hash(comp_val, req).unwrap_or_else(|| req.to_owned());
            return Some((tag, req.to_owned()));
        }
        return None;
    }
    let head = comp_val["head"].as_str()?;
    let tag = find_tag_for_hash(comp_val, head).unwrap_or_else(|| head.to_owned());
    Some((tag, head.to_owned()))
}

pub(crate) fn find_tag_for_hash(comp_val: &Value, target_hash: &str) -> Option<String> {
    ["versions", "orphanedVersions"]
        .into_iter()
        .find_map(|field| {
            comp_val[field]
                .as_object()?
                .iter()
                .find_map(|(tag, val)| (val.as_str() == Some(target_hash)).then(|| tag.clone()))
        })
}

fn extract_version_files(ver_val: &Value) -> Vec<String> {
    ver_val["files"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| {
            item.as_str()
                .or_else(|| item["relativePath"].as_str())
                .or_else(|| item["path"].as_str())
                .map(str::to_owned)
        })
        .collect()
}

fn extract_env_id(extensions: &[Value]) -> String {
    for ext in extensions {
        if ext_id_str(ext).is_some_and(|name| aspect_id_without_version(&name) == ENVS_ASPECT)
            && let Some(env_id) = ext["data"]["id"]
                .as_str()
                .or_else(|| ext["config"]["env"].as_str())
                .filter(|val| !val.is_empty())
        {
            return env_id.to_owned();
        }
    }
    "teambit.harmony/node".to_owned()
}

fn extract_config_map(extensions: &[Value]) -> Map<String, Value> {
    let mut map = Map::new();
    for ext in extensions {
        if let Some(name) = ext_id_str(ext) {
            let cfg = ext
                .get("config")
                .cloned()
                .unwrap_or_else(|| Value::Object(Map::new()));
            map.insert(name, cfg);
        }
    }
    map
}

fn check_is_removed(extensions: &[Value]) -> bool {
    extensions
        .iter()
        .any(|ext| {
            ext_id_str(ext).is_some_and(|name| aspect_id_without_version(&name) == REMOVE_ASPECT)
                && (ext["config"]["removed"] == true || ext["data"]["removed"] == true)
        })
}

pub(super) fn ext_id_str(ext: &Value) -> Option<String> {
    if let Some(name) = ext["name"]
        .as_str()
        .or_else(|| ext["legacyId"].as_str())
        .or_else(|| ext["extensionId"].as_str())
    {
        return Some(name.to_owned());
    }
    let id = ext.get("extensionId")?.as_object()?;
    let raw_name = id.get("name")?.as_str()?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(bare, ver)| (bare, Some(ver).filter(|ver| !ver.is_empty())));
    let base = match id
        .get("scope")
        .and_then(Value::as_str)
        .filter(|scope| !scope.is_empty())
    {
        Some(scope) => format!("{scope}/{name}"),
        None => name.to_owned(),
    };
    let version = id
        .get("version")
        .and_then(Value::as_str)
        .filter(|ver| !ver.is_empty())
        .or(inline_ver);
    Some(match version {
        Some(ver) => format!("{base}@{ver}"),
        None => base,
    })
}

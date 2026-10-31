//! What the local scope knows about a component: its Version's extensions and
//! the model's `bindingPrefix`. Objects are zlib-deflated files at
//! `<scope>/objects/<2 hex>/<38 hex>` holding `<type> <hash> <size>\0<json>`.

use super::{ENV_OF_ENVS, component_package_name};
use crate::{config::aspect_id_without_version, model::ComponentId};
use flate2::read::ZlibDecoder;
use serde_json::{Map, Value};
use sha1::{Digest, Sha1};
use std::{
    fmt::Write as _,
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

/// Objects larger than this are not read (no Version or model gets close).
const MAX_OBJECT_BYTES: u64 = 64 * 1024 * 1024;

const ENVS_ASPECT: &str = "teambit.envs/envs";
const DEPENDENCY_RESOLVER_ASPECT: &str = "teambit.dependencies/dependency-resolver";

/// What install needs from a component's scope objects.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct ModelData {
    pub binding_prefix: Option<String>,
    /// The Version's `extensions` array, as stored.
    pub extensions: Vec<Value>,
    /// The Version's files (`relativePath`), as `hasEnvManifest` reads them.
    pub files: Vec<String>,
}

impl ModelData {
    /// The `teambit.envs/envs` data of the Version, where the env descriptor
    /// (`type`, `id`) is stored at tag time.
    fn envs_data(&self) -> Option<&Value> {
        self.extensions
            .iter()
            .find(|extension| extension_name(extension).as_deref() == Some(ENVS_ASPECT))
            .and_then(|extension| extension.get("data"))
    }

    /// `isUsingAspectEnv`: the env descriptor's type is `aspect`.
    #[must_use]
    pub fn uses_aspect_env(&self) -> bool {
        self.envs_data()
            .and_then(|data| data.get("type"))
            .and_then(Value::as_str)
            == Some("aspect")
    }

    /// `hasEnvManifest`: the Version ships an `env.jsonc` or `env.json`.
    #[must_use]
    pub fn has_env_manifest(&self) -> bool {
        self.files
            .iter()
            .any(|file| file == "env.jsonc" || file == "env.json")
    }

    /// The component's own env is `teambit.envs/env`: an env loaded as an env plugin
    /// (`*.bit-env.*`), not as an aspect with a provider.
    #[must_use]
    pub fn uses_env_of_envs(&self) -> bool {
        self.extensions.iter().any(uses_env_of_envs)
    }

    /// `getPackageName`: the `dependency-resolver` data's `packageName`,
    /// otherwise `componentIdToPackageName` from the model's `bindingPrefix`
    /// and the Version's `teambit.pkg/pkg` config.
    #[must_use]
    pub fn package_name(&self, id: &ComponentId) -> String {
        let stored = self.extensions
            .iter()
            .find(|extension| {
                extension_name(extension).as_deref() == Some(DEPENDENCY_RESOLVER_ASPECT)
            })
            .and_then(|extension| {
                extension
                    .get("data")?
                    .get("packageName")?
                    .as_str()
            });
        if let Some(name) = stored.filter(|name| !name.is_empty()) {
            return name.to_owned();
        }
        let aspects: Map<String, Value> = self.extensions
            .iter()
            .filter_map(|extension| {
                let name = extension_name(extension)?;
                Some((
                    name,
                    extension
                        .get("config")
                        .cloned()
                        .unwrap_or(Value::Null),
                ))
            })
            .collect();
        component_package_name(id, self.binding_prefix.as_deref(), &aspects)
    }
}

/// The aspect id of a stored extension: `name` for core aspects, the
/// serialized `extensionId` otherwise, without the version.
pub(crate) fn extension_name(extension: &Value) -> Option<String> {
    if let Some(name) = extension
        .get("name")
        .or_else(|| extension.get("legacyId"))
        .or_else(|| extension.get("extensionId"))
        .and_then(Value::as_str)
    {
        return Some(aspect_id_without_version(name).to_owned());
    }
    let id = extension.get("extensionId")?.as_object()?;
    let name = aspect_id_without_version(id.get("name")?.as_str()?);
    Some(
        match id
            .get("scope")
            .and_then(Value::as_str)
            .filter(|scope| !scope.is_empty())
        {
            Some(scope) => format!("{scope}/{name}"),
            None => name.to_owned(),
        },
    )
}

/// The extension configures `teambit.envs/env`, or `teambit.envs/envs` sets it as env.
fn uses_env_of_envs(extension: &Value) -> bool {
    let bare = extension_name(extension).unwrap_or_default();
    bare == ENV_OF_ENVS
        || (bare == ENVS_ASPECT
            && [extension.get("config"), extension.get("data")]
                .into_iter()
                .flatten()
                .any(|data| {
                    data.get("env")
                        .and_then(Value::as_str)
                        .is_some_and(|env| aspect_id_without_version(env) == ENV_OF_ENVS)
                }))
}

/// Reads models and Versions from a scope's `objects` directory.
#[derive(Debug, Clone)]
pub struct ScopeObjects {
    scope: PathBuf,
    objects: PathBuf,
}

fn is_hash(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

impl ScopeObjects {
    #[must_use]
    pub fn new(scope: &Path) -> Self {
        Self { scope: scope.to_path_buf(), objects: scope.join("objects") }
    }

    /// The JSON body of an object; `None` when it is not in the scope.
    pub fn read(&self, hash: &str) -> io::Result<Option<Value>> {
        if !is_hash(hash) {
            return Ok(None);
        }
        let path = self.objects
            .join(&hash[..2])
            .join(&hash[2..]);
        let file = match fs::File::open(&path) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        let mut inflated = Vec::new();
        ZlibDecoder::new(file).take(MAX_OBJECT_BYTES).read_to_end(&mut inflated)?;
        let header_end = inflated
            .iter()
            .position(|byte| *byte == 0)
            .ok_or_else(|| corrupt(&path))?;
        serde_json::from_slice(&inflated[header_end + 1..]).map(Some).map_err(|_| corrupt(&path))
    }

    /// The model of `scope/name` (its hash is from `index.json` or the sha1 of that id),
    /// and the Version of `version` (a tag of the model or a snap hash).
    pub fn component(&self, id: &ComponentId) -> io::Result<Option<ModelData>> {
        let (Some(scope), Some(version)) = (id.scope.as_deref(), id.version.as_deref()) else {
            return Ok(None);
        };
        let model = self.read_model(scope, &id.name)?;
        self.model_data(model.as_ref(), Some(version))
    }

    /// Like [`Self::component`], but an id without a version reads the model's
    /// head (how `importAndGetMany` loads a configured aspect or env at `*`).
    pub fn component_or_head(&self, id: &ComponentId) -> io::Result<Option<ModelData>> {
        let Some(scope) = id.scope.as_deref() else { return Ok(None) };
        let model = self.read_model(scope, &id.name)?;
        self.model_data(model.as_ref(), id.version.as_deref())
    }

    fn read_model(&self, scope: &str, name: &str) -> io::Result<Option<Value>> {
        let hash = self
            .index_hash(scope, name)
            .unwrap_or_else(|| sha1_hex(&format!("{scope}/{name}")));
        if let Some(model) = self.read(&hash)? {
            return Ok(Some(model));
        }
        self.read(&sha1_hex(name))
    }

    fn index_hash(&self, scope: &str, name: &str) -> Option<String> {
        let bytes = fs::read(self.scope.join("index.json")).ok()?;
        let index = bit_object_import::parse_jsonc(&bytes).ok()?;
        let rows = index["components"].as_array().or_else(|| index.as_array())?;
        rows.iter()
            .find(|row| row["isSymlink"] != true && scope_row_matches(row, scope, name))
            .and_then(|row| row["hash"].as_str())
            .map(str::to_owned)
    }

    /// [`Self::component_or_head`] of a configured id, `scope/name` with an optional
    /// `@version`; `None` for an id without a scope.
    pub fn aspect(&self, id: &str) -> io::Result<Option<ModelData>> {
        let (bare, version) = id
            .split_once('@')
            .map_or((id, None), |(bare, version)| (bare, Some(version)));
        let Some((scope, name)) = bare.split_once('/') else { return Ok(None) };
        self.component_or_head(&ComponentId {
            scope: Some(scope.to_owned()),
            default_scope: None,
            name: name.to_owned(),
            version: version.map(str::to_owned),
        })
    }

    fn model_data(
        &self,
        model: Option<&Value>,
        version: Option<&str>,
    ) -> io::Result<Option<ModelData>> {
        let binding_prefix = model
            .as_ref()
            .and_then(|model| model.get("bindingPrefix"))
            .and_then(Value::as_str)
            .map(str::to_owned);
        let version = match version_hash(model, version) {
            Some(hash) => self.read(&hash)?,
            None => None,
        };
        if model.is_none() && version.is_none() {
            return Ok(None);
        }
        let extensions = version
            .as_ref()
            .and_then(|version| version.get("extensions"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let files = version
            .as_ref()
            .and_then(|version| version.get("files"))
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|file| {
                file.get("relativePath")?
                    .as_str()
                    .map(str::to_owned)
            })
            .collect();
        Ok(Some(ModelData { binding_prefix, extensions, files }))
    }
}

fn scope_row_matches(row: &Value, scope: &str, name: &str) -> bool {
    if let Some(id_str) = row["id"].as_str() {
        let (row_scope, row_name) = id_str
            .split_once('/')
            .unwrap_or(("", id_str));
        return row_name == name && (row_scope.is_empty() || row_scope == scope);
    }
    row["id"]["name"].as_str() == Some(name)
        && row["id"]["scope"]
            .as_str()
            .is_none_or(|row_scope| row_scope.is_empty() || row_scope == scope)
}

/// The Version hash of `version`: a snap hash as is, a tag through the model's
/// `versions` or `orphanedVersions`, and the model `head` when no version is given.
fn version_hash(model: Option<&Value>, version: Option<&str>) -> Option<String> {
    match version.filter(|ver| !matches!(*ver, "" | "latest" | "head")) {
        Some(version) if is_hash(version) => Some(version.to_owned()),
        Some(version) => {
            let model = model?;
            model["versions"][version]
                .as_str()
                .or_else(|| model["orphanedVersions"][version].as_str())
                .map(str::to_owned)
        }
        None => model?
            .get("head")?
            .as_str()
            .map(str::to_owned),
    }
}

#[must_use]
pub fn sha1_hex(text: &str) -> String {
    Sha1::digest(text.as_bytes())
        .iter()
        .fold(String::with_capacity(40), |mut hex, byte| {
            let _ = write!(hex, "{byte:02x}");
            hex
        })
}

fn corrupt(path: &Path) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, format!("corrupted scope object {}", path.display()))
}

#[cfg(test)]
mod tests;

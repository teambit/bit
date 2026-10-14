//! What the local scope knows about a component: its Version's extensions and
//! the model's `bindingPrefix`. Objects are zlib-deflated files at
//! `<scope>/objects/<2 hex>/<38 hex>` holding `<type> <hash> <size>\0<json>`.

use crate::model::ComponentId;
use flate2::read::ZlibDecoder;
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{
    fmt::Write as _,
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

/// Objects larger than this are not read (no Version or model gets close).
const MAX_OBJECT_BYTES: u64 = 64 * 1024 * 1024;

/// What install needs from a component's scope objects.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct ModelData {
    pub binding_prefix: Option<String>,
    /// The Version's `extensions` array, as stored.
    pub extensions: Vec<Value>,
}

/// Reads models and Versions from a scope's `objects` directory.
#[derive(Debug, Clone)]
pub struct ScopeObjects {
    objects: PathBuf,
}

fn is_hash(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

impl ScopeObjects {
    #[must_use]
    pub fn new(scope: &Path) -> Self {
        Self { objects: scope.join("objects") }
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

    /// The model of `scope/name` (its hash is the sha1 of that id), and the
    /// Version of `version` (a tag of the model or a snap hash).
    pub fn component(&self, id: &ComponentId) -> io::Result<Option<ModelData>> {
        let (Some(scope), Some(version)) = (id.scope.as_deref(), id.version.as_deref()) else {
            return Ok(None);
        };
        let model = self.read(&sha1_hex(&format!("{scope}/{}", id.name)))?;
        let binding_prefix = model
            .as_ref()
            .and_then(|model| model.get("bindingPrefix"))
            .and_then(Value::as_str)
            .map(str::to_owned);
        let version_hash = if is_hash(version) {
            Some(version.to_owned())
        } else {
            model
                .as_ref()
                .and_then(|model| {
                    model
                        .get("versions")?
                        .get(version)?
                        .as_str()
                        .map(str::to_owned)
                })
        };
        let version = match version_hash {
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
        Ok(Some(ModelData { binding_prefix, extensions }))
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

//! Read-only access to the workspace scope objects: component models, `Version`s
//! and their `Source` files. Objects are loose zlib files whose inflated contents
//! are `<type> <hash> <size>\0<body>`.

use flate2::read::ZlibDecoder;
use serde_json::Value;
use sha1::{Digest, Sha1};
use sha2::Sha256;
use std::{
    fs, io,
    io::Read,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, PoisonError},
};

const MAX_OBJECT: u64 = 64 * 1024 * 1024;

/// The workspace scope: `.bit`, or `.git/bit` in a git repository.
#[derive(Debug, Clone)]
pub struct Scope {
    path: PathBuf,
    proofs: Option<Arc<Mutex<Vec<Value>>>>,
}

impl PartialEq for Scope {
    fn eq(&self, other: &Self) -> bool {
        self.path == other.path
    }
}
impl Eq for Scope {}

impl Scope {
    /// The scope of the workspace at `root`, when it has one.
    #[must_use]
    pub fn find(root: &Path) -> Option<Self> {
        [root.join(".bit"), root.join(".git").join("bit")]
            .into_iter()
            .find(|path| path.join("objects").is_dir() || path.join("scope.json").is_file())
            .map(|path| Self { path, proofs: None })
    }

    /// Retain content proofs for every scope object read through this handle.
    #[must_use]
    pub fn recording(mut self) -> Self {
        self.proofs = Some(Arc::new(Mutex::new(Vec::new())));
        self
    }

    /// Immutable proofs suitable for `dependencyFreshValidate`.
    #[must_use]
    pub fn read_set(&self) -> Vec<Value> {
        self.proofs
            .as_ref()
            .map(|proofs| {
                proofs
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .clone()
            })
            .unwrap_or_default()
    }

    /// The scope directory.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// `<scope>/cache/components/deps`, Bit's dependency cache.
    #[must_use]
    pub fn dependency_cache(&self) -> PathBuf {
        self.path
            .join("cache")
            .join("components")
            .join("deps")
    }

    /// The raw body of an object of the given type; `None` when it is missing.
    pub fn object(&self, hash: &str, kind: &str) -> io::Result<Option<Vec<u8>>> {
        if hash.len() < 3 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Ok(None);
        }
        let file = self.path
            .join("objects")
            .join(&hash[..2])
            .join(&hash[2..]);
        let compressed = compressed(&file)?;
        if let Some(proofs) = &self.proofs {
            proofs
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(proof_from_bytes(&file, compressed.as_deref()));
        }
        let Some(compressed) = compressed else { return Ok(None) };
        let mut inflated = Vec::new();
        ZlibDecoder::new(compressed.as_slice()).take(MAX_OBJECT).read_to_end(&mut inflated)?;
        let split = inflated
            .iter()
            .position(|byte| *byte == 0)
            .ok_or_else(|| invalid("scope object header"))?;
        let header =
            std::str::from_utf8(&inflated[..split]).map_err(|_| invalid("scope object header"))?;
        if header.split(' ').next() != Some(kind) {
            return Ok(None);
        }
        Ok(Some(inflated[split + 1..].to_vec()))
    }

    /// The JSON body of an object of the given type.
    pub fn json(&self, hash: &str, kind: &str) -> io::Result<Option<Value>> {
        self.object(hash, kind)?
            .map(|body| serde_json::from_slice(&body).map_err(io::Error::other))
            .transpose()
    }

    /// The `ModelComponent` of `scope/name`.
    pub fn model(&self, id: &str) -> io::Result<Option<Value>> {
        self.json(&hex_sha1(id.as_bytes()), "Component")
    }

    /// The `Version` object of `scope/name` at `version` (a tag or a snap hash),
    /// or at the head when `version` is `None`.
    pub fn version(&self, id: &str, version: Option<&str>) -> io::Result<Option<Value>> {
        let Some(model) = self.model(id)? else {
            return match version.filter(|version| is_hash(version)) {
                Some(hash) => self.json(hash, "Version"),
                None => Ok(None),
            };
        };
        let reference = match version {
            Some(version) => model["versions"]
                .get(version)
                .and_then(Value::as_str)
                .or_else(|| is_hash(version).then_some(version)),
            None => model["head"].as_str(),
        };
        reference.map_or(Ok(None), |hash| self.json(hash, "Version"))
    }

    /// The contents of the file at `relative_path` of a `Version` object.
    pub fn file(&self, version: &Value, relative_path: &str) -> io::Result<Option<Vec<u8>>> {
        let Some(files) = version["files"].as_array() else { return Ok(None) };
        let Some(hash) = files
            .iter()
            .find(|file| file["relativePath"].as_str() == Some(relative_path))
            .and_then(|file| file["file"].as_str())
        else {
            return Ok(None);
        };
        self.object(hash, "Source")
    }
}

/// `isHash` of `@teambit/component-version`: 3 to 40 lowercase hex characters.
#[must_use]
pub fn is_hash(version: &str) -> bool {
    (3..=40).contains(&version.len())
        && version
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// `snapToSemver`: a snap hash becomes `0.0.0-<hash>`.
#[must_use]
pub fn snap_to_semver(version: &str) -> String {
    if is_hash(version) { format!("0.0.0-{version}") } else { version.to_owned() }
}

/// Lowercase hex SHA-1, the scope object hash.
#[must_use]
pub fn hex_sha1(bytes: &[u8]) -> String {
    Sha1::digest(bytes)
        .iter()
        .fold(String::with_capacity(40), |mut text, byte| {
            use std::fmt::Write;
            let _ = write!(text, "{byte:02x}");
            text
        })
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

/// A content proof of a local environment manifest, including its absence.
pub fn read_proof(path: &Path) -> io::Result<Value> {
    match fs::read(path) {
        Ok(bytes) => Ok(proof_from_bytes(path, Some(&bytes))),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(proof_from_bytes(path, None)),
        Err(error) => Err(error),
    }
}

/// Build a content proof from already bounded bytes, or an observed absence.
#[must_use]
pub fn proof_from_bytes(path: &Path, bytes: Option<&[u8]>) -> Value {
    serde_json::json!({"path":path,"hash":bytes.map(|bytes|format!("{:x}",Sha256::digest(bytes)))})
}

fn compressed(path: &Path) -> io::Result<Option<Vec<u8>>> {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let mut bytes = Vec::new();
    file.take(MAX_OBJECT + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_OBJECT {
        return Err(invalid("scope compressed object limit"));
    }
    Ok(Some(bytes))
}

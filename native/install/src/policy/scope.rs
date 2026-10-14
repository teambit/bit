//! Read-only access to the workspace scope objects: component models, `Version`s
//! and their `Source` files. Objects are loose zlib files whose inflated contents
//! are `<type> <hash> <size>\0<body>`.

use flate2::read::ZlibDecoder;
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{
    fs, io,
    io::Read,
    path::{Path, PathBuf},
};

const MAX_OBJECT: u64 = 64 * 1024 * 1024;

/// The workspace scope: `.bit`, or `.git/bit` in a git repository.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Scope {
    path: PathBuf,
}

impl Scope {
    /// The scope of the workspace at `root`, when it has one.
    #[must_use]
    pub fn find(root: &Path) -> Option<Self> {
        [root.join(".bit"), root.join(".git").join("bit")]
            .into_iter()
            .find(|path| path.join("objects").is_dir() || path.join("scope.json").is_file())
            .map(|path| Self { path })
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
        let compressed = match fs::File::open(&file) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        let mut inflated = Vec::new();
        ZlibDecoder::new(compressed).take(MAX_OBJECT).read_to_end(&mut inflated)?;
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

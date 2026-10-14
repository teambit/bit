//! Loose Bit objects: `objects/<2>/<38>` holding `deflate("<Type> <hash> <size>\0<content>")`
//! (`BitObject.compress`), plus the scope `index.json` and remote refs files.

use flate2::{Compression, read::ZlibDecoder, write::ZlibEncoder};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT_TEMPORARY: AtomicU64 = AtomicU64::new(0);

/// An inflated object: its type header and JSON or raw content.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Parsed {
    pub kind: String,
    pub content: Vec<u8>,
}

impl Parsed {
    pub fn json(&self) -> io::Result<Value> {
        serde_json::from_slice(&self.content)
            .map_err(|_| invalid(&format!("invalid {} object", self.kind)))
    }
}

/// Inflate and split an object.
pub fn parse(compressed: &[u8]) -> io::Result<Parsed> {
    let mut inflated = Vec::new();
    ZlibDecoder::new(compressed).read_to_end(&mut inflated)?;
    let separator = inflated
        .iter()
        .position(|byte| *byte == 0)
        .ok_or_else(|| invalid("object without header"))?;
    let header = std::str::from_utf8(&inflated[..separator]).map_err(|_| invalid("object header"))?;
    let kind = header
        .split(' ')
        .next()
        .unwrap_or_default()
        .to_string();
    let content = inflated.split_off(separator + 1);
    Ok(Parsed { kind, content })
}

/// `BitObject.compress()`.
pub fn compress(kind: &str, hash: &str, content: &[u8]) -> io::Result<Vec<u8>> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(format!("{kind} {hash} {}\0", content.len()).as_bytes())?;
    encoder.write_all(content)?;
    encoder.finish()
}

/// Serialize a JSON object like `JSON.stringify` (compact) and compress it.
pub fn compress_json(kind: &str, hash: &str, value: &Value) -> io::Result<Vec<u8>> {
    compress(kind, hash, &serde_json::to_vec(value)?)
}

#[must_use]
pub fn sha1_hex(text: &str) -> String {
    Sha1::digest(text.as_bytes())
        .iter()
        .fold(String::with_capacity(40), |mut hex, byte| {
            use std::fmt::Write as _;
            let _ = write!(hex, "{byte:02x}");
            hex
        })
}

/// `sha1("scope/name")`, the Component object of a component id.
#[must_use]
pub fn component_hash(scope: &str, name: &str) -> String {
    sha1_hex(&format!("{scope}/{name}"))
}

/// `sha1("scope/name:VersionHistory")`.
#[must_use]
pub fn version_history_hash(scope: &str, name: &str) -> String {
    sha1_hex(&format!("{scope}/{name}:VersionHistory"))
}

#[must_use]
pub fn is_hash(text: &str) -> bool {
    text.len() == 40
        && text
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

/// A scope directory: `.bit` (or `.git/bit`) of a workspace, or a bare scope.
#[derive(Debug, Clone)]
pub struct Repo {
    root: PathBuf,
}

impl Repo {
    #[must_use]
    pub fn new(root: &Path) -> Self {
        Self { root: root.to_path_buf() }
    }

    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    fn object_path(&self, hash: &str) -> io::Result<PathBuf> {
        if !is_hash(hash) {
            return Err(invalid(&format!("invalid object ref: {hash}")));
        }
        Ok(self.root
            .join("objects")
            .join(&hash[..2])
            .join(&hash[2..]))
    }

    #[must_use]
    pub fn exists(&self, hash: &str) -> bool {
        self.object_path(hash).is_ok_and(|path| path.is_file())
    }

    /// The compressed bytes of an object, `None` when it does not exist.
    pub fn read_raw(&self, hash: &str) -> io::Result<Option<Vec<u8>>> {
        match fs::read(self.object_path(hash)?) {
            Ok(bytes) => Ok(Some(bytes)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub fn read(&self, hash: &str) -> io::Result<Option<Parsed>> {
        self.read_raw(hash)?
            .as_deref()
            .map(parse)
            .transpose()
    }

    pub fn read_json(&self, hash: &str) -> io::Result<Option<Value>> {
        self.read(hash)?
            .map(|parsed| parsed.json())
            .transpose()
    }

    /// Write compressed bytes atomically.
    pub fn write_raw(&self, hash: &str, compressed: &[u8]) -> io::Result<()> {
        write_atomic(&self.object_path(hash)?, compressed)
    }

    /// `getHashFromIndex(IndexType.lanes, ...)`: the object hash of the lane
    /// `scope/name`, `None` when the index does not list it.
    pub fn lane_hash(&self, scope: &str, name: &str) -> io::Result<Option<String>> {
        let index = read_index(&self.root.join("index.json"))?;
        Ok(index["lanes"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|row| {
                row["id"]["scope"].as_str() == Some(scope)
                    && row["id"]["name"].as_str() == Some(name)
            })
            .and_then(|row| row["hash"].as_str())
            .map(str::to_owned))
    }

    /// Append Component and Lane rows that `index.json` does not list yet
    /// (`ScopeIndex.addMany`), keeping existing rows and their order.
    pub fn index_add(&self, rows: &[IndexRow]) -> io::Result<()> {
        if rows.is_empty() {
            return Ok(());
        }
        let path = self.root.join("index.json");
        let mut index = read_index(&path)?;
        let mut changed = false;
        for row in rows {
            changed |= add_row(&mut index, row);
        }
        if changed {
            // `ScopeIndex.write()` ends the file with a newline; remote refs files do not.
            write_atomic(&path, format!("{}\n", serde_json::to_string_pretty(&index)?).as_bytes())?;
        }
        Ok(())
    }

    fn remote_ref_path(&self, scope: &str, lane: &str) -> io::Result<PathBuf> {
        for segment in [scope, lane] {
            if segment.is_empty()
                || segment.contains(['/', '\\', '\0'])
                || segment == "."
                || segment == ".."
            {
                return Err(invalid(&format!("invalid remote lane segment {segment:?}")));
            }
        }
        Ok(self.root
            .join("refs")
            .join("remotes")
            .join(scope)
            .join(lane))
    }

    /// `refs/remotes/<scope>/<lane>` entries: `[{ id: { scope, name }, head }]`.
    pub fn remote_refs(&self, scope: &str, lane: &str) -> io::Result<Vec<RemoteRef>> {
        match fs::read(self.remote_ref_path(scope, lane)?) {
            Ok(bytes) => serde_json::from_slice::<Vec<Value>>(&bytes)
                .map_err(|_| invalid("invalid remote lane refs"))
                .map(|entries| {
                    entries
                        .iter()
                        .filter_map(RemoteRef::from_json)
                        .collect()
                }),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(error) => Err(error),
        }
    }

    /// Update or append heads (`RemoteLanes.addEntry`), then write the file.
    pub fn add_remote_refs(&self, scope: &str, lane: &str, heads: &[RemoteRef]) -> io::Result<()> {
        if heads.is_empty() {
            return Ok(());
        }
        let mut refs = self.remote_refs(scope, lane)?;
        for head in heads {
            match refs
                .iter_mut()
                .find(|existing| existing.scope == head.scope && existing.name == head.name)
            {
                Some(existing) => existing.head.clone_from(&head.head),
                None => refs.push(head.clone()),
            }
        }
        let json: Vec<Value> = refs
            .iter()
            .map(RemoteRef::to_json)
            .collect();
        let path = self.remote_ref_path(scope, lane)?;
        write_atomic(&path, serde_json::to_string_pretty(&json)?.as_bytes())
    }
}

/// One head of a remote lane.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteRef {
    pub scope: String,
    pub name: String,
    pub head: String,
}

impl RemoteRef {
    fn from_json(value: &Value) -> Option<Self> {
        Some(Self {
            scope: value["id"]["scope"].as_str()?.to_string(),
            name: value["id"]["name"].as_str()?.to_string(),
            head: value["head"].as_str()?.to_string(),
        })
    }

    fn to_json(&self) -> Value {
        json!({ "id": { "scope": self.scope, "name": self.name }, "head": self.head })
    }
}

/// A Component or Lane row of `index.json`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IndexRow {
    Component { scope: String, name: String, hash: String },
    Lane { scope: String, name: String, hash: String },
}

fn read_index(path: &Path) -> io::Result<Value> {
    match fs::read(path) {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|_| invalid("invalid scope index.json"))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            Ok(json!({ "components": [], "lanes": [] }))
        }
        Err(error) => Err(error),
    }
}

fn add_row(index: &mut Value, row: &IndexRow) -> bool {
    let (key, hash, entry) = match row {
        IndexRow::Component { scope, name, hash } => (
            "components",
            hash,
            json!({ "id": { "scope": scope, "name": name }, "isSymlink": false, "hash": hash }),
        ),
        IndexRow::Lane { scope, name, hash } => {
            ("lanes", hash, json!({ "id": { "scope": scope, "name": name }, "hash": hash }))
        }
    };
    if !index[key].is_array() {
        index[key] = json!([]);
    }
    let Some(rows) = index[key].as_array_mut() else { return false };
    let Some(existing) = rows
        .iter_mut()
        .find(|existing| existing["hash"].as_str() == Some(hash.as_str()))
    else {
        rows.push(entry);
        return true;
    };
    // `ScopeIndex.addOne`: a lane found by hash takes the new id (`bit lane rename`).
    if key == "lanes" && existing["id"] != entry["id"] {
        existing["id"] = entry["id"].clone();
        return true;
    }
    false
}

/// Write via a temporary sibling and rename, creating parent directories.
pub fn write_atomic(path: &Path, contents: &[u8]) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| invalid("path without parent"))?;
    fs::create_dir_all(parent)?;
    let counter = NEXT_TEMPORARY.fetch_add(1, Ordering::Relaxed);
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("object");
    let temporary = parent.join(format!(".{file_name}.{}.{counter}", std::process::id()));
    let result = fs::write(&temporary, contents).and_then(|()| fs::rename(&temporary, path));
    if result.is_err() {
        let _cleanup = fs::remove_file(&temporary);
    }
    result
}

pub fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

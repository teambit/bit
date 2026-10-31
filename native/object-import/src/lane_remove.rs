//! Remove local Lane objects to the scope trash and unindex them.

use crate::{recovery, store::Store, workspace::engine::command::outbound};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

pub struct Plan {
    root: PathBuf,
    before: Vec<u8>,
    before_bitmap: Vec<u8>,
    index: Value,
    hashes: Vec<String>,
}

impl Plan {
    /// Validate every selected local Lane before the first object move.
    pub fn prepare(root: &Path, ids: &[String]) -> io::Result<Self> {
        if ids.is_empty() || ids.len() > 32 {
            return Err(invalid("lane removal selection"));
        }
        let scope_dir = crate::scope_path(root);
        let before = fs::read(scope_dir.join("index.json"))?;
        let mut index: Value = serde_json::from_slice(&before)?;
        let before_bitmap = fs::read(root.join(".bitmap"))?;
        let bitmap = recovery::jsonc::parse(&before_bitmap)?;
        let current = &bitmap["_bit_lane"]["id"];
        let rows = index["lanes"].as_array_mut().ok_or_else(|| invalid("lane index"))?;
        let mut hashes = Vec::with_capacity(ids.len());
        let mut seen = HashSet::new();
        for id in ids {
            if !seen.insert(id) {
                return Err(invalid("lane removal ID"));
            }
            hashes.push(select_one(root, rows, current, id)?);
        }
        Store::new(scope_dir.join("objects"), None)?.validate_index_write()?;
        Ok(Self { root: root.to_owned(), before, before_bitmap, index, hashes })
    }

    pub fn commit(&self) -> io::Result<()> {
        let scope_dir = crate::scope_path(&self.root);
        if fs::read(scope_dir.join("index.json"))? != self.before
            || fs::read(self.root.join(".bitmap"))? != self.before_bitmap
        {
            return Err(invalid("lane workspace changed before removal"));
        }
        for hash in &self.hashes {
            if trash(&self.root, hash).try_exists()? || !object(&self.root, hash).try_exists()? {
                return Err(invalid("lane object changed before removal"));
            }
        }
        for hash in &self.hashes {
            let target = trash(&self.root, hash);
            fs::create_dir_all(target.parent().ok_or_else(|| invalid("lane trash path"))?)?;
            fs::rename(object(&self.root, hash), target)?;
        }
        let mut bytes = serde_json::to_vec_pretty(&self.index)?;
        bytes.push(b'\n');
        Store::new(scope_dir.join("objects"), None)?.write_index(&bytes)
    }
}

fn select_one(root: &Path, rows: &mut Vec<Value>, current: &Value, id: &str) -> io::Result<String> {
    let (scope, name) = id.split_once('/').ok_or_else(|| invalid("lane ID"))?;
    if !valid_part(scope) || !valid_part(name) || name == "main" {
        return Err(invalid("lane removal ID"));
    }
    let identity = json!({"scope":scope,"name":name});
    if current == &identity {
        return Err(invalid("currently used lane"));
    }
    let position = rows
        .iter()
        .position(|row| row["id"] == identity)
        .ok_or_else(|| invalid("lane is not indexed"))?;
    if rows
        .iter()
        .filter(|row| row["id"] == identity)
        .count()
        != 1
    {
        return Err(invalid("ambiguous lane index"));
    }
    let hash = rows[position]["hash"].as_str().ok_or_else(|| invalid("lane hash"))?;
    if !valid_hash(hash) {
        return Err(invalid("lane hash"));
    }
    let lane = outbound::read_object(&crate::scope_path(root).join("objects"), hash, "Lane")?;
    if lane["scope"] != scope || lane["name"] != name {
        return Err(invalid("lane object identity"));
    }
    if trash(root, hash).try_exists()? {
        return Err(invalid("lane already in trash"));
    }
    let hash = hash.to_owned();
    rows.remove(position);
    Ok(hash)
}

fn valid_part(value: &str) -> bool {
    !value.is_empty()
        && !value.contains('/')
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
}

fn valid_hash(value: &str) -> bool {
    value.len() == 40
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn object(root: &Path, hash: &str) -> PathBuf {
    crate::scope_path(root)
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..])
}

fn trash(root: &Path, hash: &str) -> PathBuf {
    crate::scope_path(root)
        .join("trash")
        .join(&hash[..2])
        .join(&hash[2..])
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

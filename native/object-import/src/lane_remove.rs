//! Move local `Lane` objects ([`Plan`]) to the scope trash and unindex them from `index.json`.

use crate::{recovery, store::Store, workspace::engine::command::outbound};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

/// Retained local lane deletion plan moving `Lane` objects to scope trash and updating `index.json`.
#[derive(Debug, Clone, PartialEq, Eq)]
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
        let mut index: Value = match crate::parse_jsonc(&before)? {
            Value::Array(components) => serde_json::json!({"components":components,"lanes":[]}),
            other => other,
        };
        if index.is_object() && index.get("lanes").is_none_or(Value::is_null) {
            index["lanes"] = serde_json::json!([]);
        }
        let before_bitmap = fs::read(root.join(".bitmap"))?;
        let bitmap = recovery::jsonc::parse(&before_bitmap)?;
        let rows = index["lanes"].as_array_mut().ok_or_else(|| invalid("lane index"))?;
        let hashes = select_all(root, rows, &bitmap["_bit_lane"], ids)?;
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
            let source = object(&self.root, hash);
            if trash(&self.root, hash).try_exists()?
                || !source.try_exists()?
                || fs::symlink_metadata(&source)?.file_type().is_symlink()
            {
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

#[inline]
fn lane_matches(row: &Value, scope: &str, name: &str) -> bool {
    crate::workspace::engine::command::inbound::remote::file_list::row_lane_matches(
        row, scope, name,
    )
}

#[inline]
fn canonical_lane_parts(raw_id: &str) -> io::Result<(&str, &str)> {
    let Some((raw_scope, raw_name)) = raw_id.trim().split_once('/') else {
        return Err(invalid("lane ID"));
    };
    Ok((raw_scope.trim(), raw_name.trim()))
}

fn select_all(
    root: &Path,
    rows: &mut Vec<Value>,
    current: &Value,
    ids: &[String],
) -> io::Result<Vec<String>> {
    let mut hashes = Vec::with_capacity(ids.len());
    let mut seen = HashSet::with_capacity(ids.len());
    let mut seen_hashes = HashSet::with_capacity(ids.len());
    for raw_id in ids {
        let (scope, name) = canonical_lane_parts(raw_id)?;
        if !seen.insert((scope, name)) {
            return Err(invalid("lane removal ID"));
        }
        let hash = select_one(root, rows, current, scope, name)?;
        if !seen_hashes.insert(hash.clone()) {
            return Err(invalid("duplicate lane hash"));
        }
        hashes.push(hash);
    }
    Ok(hashes)
}

fn select_one(
    root: &Path,
    rows: &mut Vec<Value>,
    current: &Value,
    scope: &str,
    name: &str,
) -> io::Result<String> {
    if !valid_part(scope) || !valid_part(name) || name == "main" {
        return Err(invalid("lane removal ID"));
    }
    if lane_matches(current, scope, name) {
        return Err(invalid("currently used lane"));
    }
    let position = rows
        .iter()
        .position(|row| lane_matches(row, scope, name))
        .ok_or_else(|| invalid("lane is not indexed"))?;
    if rows[position + 1..].iter().any(|row| lane_matches(row, scope, name)) {
        return Err(invalid("ambiguous lane index"));
    }
    let hash = rows[position]["hash"]
        .as_str()
        .map(str::trim)
        .filter(|hash| valid_hash(hash))
        .ok_or_else(|| invalid("lane hash"))?;
    let lane = outbound::read_object(&crate::scope_path(root).join("objects"), hash, "Lane")?;
    if lane["scope"].as_str().map(str::trim) != Some(scope)
        || lane["name"].as_str().map(str::trim) != Some(name)
    {
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
        && value.len() <= 800
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

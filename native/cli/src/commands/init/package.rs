//! Preserve package formatting through the shared published package-json kernel.
//!
//! [`render`] and [`decode_original`] format `package.json` [`Value`] payloads via [`stringify_package`], [`detect_indent`], and [`detect_newline`].
use bit_workspace_config::package_json::{detect_indent, detect_newline, stringify_package};
use serde_json::Value;
use std::io;

/// Serializes `value` as a `package.json` byte buffer preserving the indentation ([`detect_indent`]) and newline style ([`detect_newline`]) of `original`.
#[inline]
pub(super) fn render(value: &Value, original: Option<&[u8]>) -> io::Result<Vec<u8>> {
    let original = decode_original(original)?;
    Ok(stringify_package(value, &detect_indent(original), detect_newline(original))?.into_bytes())
}

/// Decodes optional UTF-8 `original` `package.json` bytes for [`render`], stripping any leading UTF-8 BOM.
#[inline]
fn decode_original(original: Option<&[u8]>) -> io::Result<&str> {
    let Some(bytes) = original.filter(|bytes| !bytes.is_empty()) else {
        return Ok("");
    };
    let raw = std::str::from_utf8(bytes).map_err(io::Error::other)?;
    let stripped = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    Ok(if stripped.trim().is_empty() { "" } else { stripped })
}

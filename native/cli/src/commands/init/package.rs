//! Preserve package formatting through the shared published package-json kernel.
use bit_workspace_config::package_json::{detect_indent, detect_newline, stringify_package};
use serde_json::Value;
use std::io;

pub(super) fn render(value: &Value, original: Option<&[u8]>) -> io::Result<Vec<u8>> {
    let original = decode_original(original)?;
    Ok(stringify_package(value, &detect_indent(original), detect_newline(original))?.into_bytes())
}

fn decode_original(original: Option<&[u8]>) -> io::Result<&str> {
    let Some(bytes) = original.filter(|bytes| !bytes.is_empty()) else {
        return Ok("");
    };
    let raw = std::str::from_utf8(bytes).map_err(io::Error::other)?;
    let stripped = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    Ok(if stripped.trim().is_empty() { "" } else { stripped })
}

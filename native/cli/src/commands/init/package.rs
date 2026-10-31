//! Preserve package formatting through the shared published package-json kernel.
use bit_workspace_config::package_json::{detect_indent, detect_newline, stringify_package};
use serde_json::Value;
use std::io;

pub(super) fn render(value: &Value, original: Option<&[u8]>) -> io::Result<Vec<u8>> {
    let original = decode_original(original)?;
    Ok(stringify_package(value, &detect_indent(original), detect_newline(original))?.into_bytes())
}

fn decode_original(original: Option<&[u8]>) -> io::Result<&str> {
    original
        .map(std::str::from_utf8)
        .transpose()
        .map_err(io::Error::other)
        .map(|text| text.map_or("", |raw| raw.strip_prefix('\u{feff}').unwrap_or(raw)))
}

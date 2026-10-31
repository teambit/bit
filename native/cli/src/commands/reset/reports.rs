//! Canonical reset summaries and detached-reset object helpers.
use crate::commands::{
    color::Chalk,
    workspace_command::{format::Formatter, results::Report},
};
use bit_object_import::reset_soft::Plan as SoftPlan;
use serde_json::{Map, Value};
use std::{ffi::OsString, fs, io, path::Path};

pub(super) fn soft_report(args: &[OsString], plan: &SoftPlan) -> Report {
    let formatter = Formatter::new(Chalk::detect(args));
    let items: Vec<_> = plan.entries
        .iter()
        .map(|entry| {
            formatter.item(&format!(
                "{} - version(s): {}",
                formatter.chalk.cyan(&entry.identity),
                entry.version,
            ))
        })
        .collect();
    let count = items.len();
    Report {
        data: Formatter::join(&[
            formatter.section(
                "soft-untagged components",
                "soft-untagged versions are no longer candidates for tagging",
                &items,
            ),
            formatter.success_summary(&format!("{count} component(s) soft-untagged successfully")),
        ]),
        code: 0,
        details: None,
    }
}

pub(super) fn report(args: &[OsString], identity: &str, labels: &[String]) -> Report {
    let formatter = Formatter::new(Chalk::detect(args));
    let item = formatter.item(&format!(
        "{} - version(s): {}",
        formatter.chalk.cyan(identity),
        labels.join(", "),
    ));
    Report {
        data: Formatter::join(&[
            formatter.section("reset components", "", &[item]),
            formatter.success_summary("1 component(s) reset successfully"),
        ]),
        code: 0,
        details: None,
    }
}

/// Format a multi-component reset report from `(identity, version_labels)` pairs.
pub(super) fn batch_report<'a>(
    args: &[OsString],
    results: impl Iterator<Item = (&'a str, &'a [String])>,
) -> Report {
    let formatter = Formatter::new(Chalk::detect(args));
    let items: Vec<_> = results
        .map(|(identity, labels)| {
            formatter.item(&format!(
                "{} - version(s): {}",
                formatter.chalk.cyan(identity),
                labels.join(", "),
            ))
        })
        .collect();
    let count = items.len();
    Report {
        data: Formatter::join(&[
            formatter.section("reset components", "", &items),
            formatter.success_summary(&format!("{count} component(s) reset successfully")),
        ]),
        code: 0,
        details: None,
    }
}

pub(super) fn never_exported_report(args: &[OsString], labels: &[String]) -> Report {
    let formatter = Formatter::new(Chalk::detect(args));
    let items = labels
        .iter()
        .map(|label| label.trim())
        .filter(|label| !label.is_empty())
        .map(|label| formatter.item(label))
        .collect::<Vec<_>>();
    let count = items.len();
    Report {
        data: Formatter::join(&[
            formatter.section("reset never-exported components", "", &items),
            formatter.success_summary(&format!(
                "successfully reset {count} never-exported component(s)",
            )),
        ]),
        code: 0,
        details: None,
    }
}

/// Locate the `.bitmap` key for `scope/name`.
pub(super) fn find_bitmap_key(
    fields: &Map<String, Value>,
    scope: &str,
    name: &str,
) -> io::Result<String> {
    let mut fallback = None;
    for (key, row) in fields {
        if key.starts_with('$') || key == "_bit_lane" || key == "version" || !row.is_object() {
            continue;
        }
        let (row_scope, row_name) =
            crate::commands::update_cmd::bitmap_row_scope_and_name(key, row);
        if row_name == name && row_scope == scope {
            return Ok(key.clone());
        }
        if row_name == name && row_scope.is_empty() && fallback.is_none() {
            fallback = Some(key.clone());
        }
    }
    fallback.ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "detached bitmap key absent"))
}

/// Encode a Bit scope object into a valid RFC 1950 zlib stream using stored deflate blocks.
pub(super) fn encode_object(kind: &str, hash: &str, value: &Value) -> io::Result<Vec<u8>> {
    let body = serde_json::to_string(value).map_err(io::Error::other)?;
    let raw = format!("{kind} {hash} {}\0{body}", body.encode_utf16().count()).into_bytes();
    let mut out = vec![0x78, 0x01];
    let chunks: Vec<&[u8]> = if raw.is_empty() { vec![&[]] } else { raw.chunks(65535).collect() };
    for (index, chunk) in chunks.iter().enumerate() {
        let last = u8::from(index + 1 == chunks.len());
        let len = u16::try_from(chunk.len()).unwrap_or(0);
        out.push(last);
        out.extend_from_slice(&len.to_le_bytes());
        out.extend_from_slice(&(!len).to_le_bytes());
        out.extend_from_slice(chunk);
    }
    out.extend_from_slice(&adler32(&raw).to_be_bytes());
    Ok(out)
}

fn adler32(bytes: &[u8]) -> u32 {
    let mut sum_low: u32 = 1;
    let mut sum_high: u32 = 0;
    for &byte in bytes {
        sum_low = (sum_low + u32::from(byte)) % 65521;
        sum_high = (sum_high + sum_low) % 65521;
    }
    (sum_high << 16) | sum_low
}

/// Write compressed object bytes to `<scope>/objects/<2>/<38>`.
pub(super) fn write_object(scope: &Path, hash: &str, bytes: &[u8]) -> io::Result<()> {
    let trimmed = hash.trim();
    if trimmed.len() != 40 || !trimmed.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid object hash"));
    }
    let path = scope
        .join("objects")
        .join(&trimmed[..2])
        .join(&trimmed[2..]);
    if let Some(parent) = path
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, bytes)
}

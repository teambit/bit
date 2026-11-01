//! Resolve explicit import identifiers and tracked scoped `.bitmap` targets.
use super::{Target, invalid};
use crate::workspace::engine::client_status::config;
use std::{io, path::Path};

pub(super) fn bitmap_targets(root: &Path) -> io::Result<Vec<Target>> {
    let bitmap = config::document(&root.join(".bitmap"))?;
    let rows = bitmap.as_object().ok_or_else(|| invalid("inbound bitmap"))?;
    let mut targets = Vec::with_capacity(rows.len());
    for (key, row) in rows {
        if key.starts_with('$')
            || matches!(key.as_str(), "_bit_lane" | "version")
            || !row.is_object()
        {
            continue;
        }
        let (row_scope, name) = crate::reset_lane::bitmap::row_identity(key, row);
        let Some(scope) = row_scope.filter(|scope| !scope.is_empty()) else {
            continue;
        };
        if name.is_empty() {
            return Err(invalid("inbound bitmap name"));
        }
        let raw_version = row["version"]
            .as_str()
            .map(str::trim)
            .filter(|ver| !ver.is_empty())
            .or_else(|| {
                key.rsplit_once('@')
                    .map(|(_, ver)| ver.trim())
                    .filter(|ver| !ver.is_empty())
            })
            .unwrap_or("latest");
        let version = normalize_target_version(raw_version);
        targets.push(Target {
            scope: Some(scope.to_owned()),
            name: name.to_owned(),
            version: version.to_owned(),
        });
    }
    Ok(targets)
}

pub(super) fn requested_target(id: &str) -> io::Result<Target> {
    let (scope, rest) = id
        .trim()
        .split_once('/')
        .ok_or_else(|| invalid("inbound unscoped id"))?;
    let (name, raw_version) = rest
        .rsplit_once('@')
        .unwrap_or((rest, "latest"));
    let (scope, name, raw_version) = (scope.trim(), name.trim(), raw_version.trim());
    if !valid_target_parts(scope, name, raw_version) {
        return Err(invalid("inbound unsupported id"));
    }
    let version = normalize_target_version(raw_version);
    Ok(Target { scope: Some(scope.to_owned()), name: name.to_owned(), version: version.to_owned() })
}

#[inline]
fn valid_target_parts(scope: &str, name: &str, raw_version: &str) -> bool {
    let valid_segment = |part: &str| {
        !part.is_empty()
            && !part.contains("..")
            && !part.contains('\\')
            && !part.chars().any(char::is_control)
    };
    valid_segment(scope)
        && scope.len() <= 512
        && valid_segment(name)
        && name.len() <= 1024
        && !name.contains('*')
        && !name.starts_with('/')
        && !name.ends_with('/')
        && !raw_version.is_empty()
        && raw_version.len() <= 256
        && !raw_version.chars().any(char::is_control)
}

#[inline]
fn normalize_target_version(raw_version: &str) -> &str {
    let raw_version = raw_version.trim();
    if raw_version.eq_ignore_ascii_case("head") || raw_version.eq_ignore_ascii_case("latest") {
        "latest"
    } else {
        raw_version
    }
}

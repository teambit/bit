//! `.bitmap` component selection ([`entries_with_default`], [`row_scope_and_name`]) and [`scope`]/owner prefix matching for `bit scope rename`.

use super::{Options, Value};
use std::io;
/// Maps `scope` to its renamed target scope when it matches [`Options`] `old` (or owner prefix).
#[inline]
pub(super) fn scope(scope: &str, options: &Options) -> Option<String> {
    let (scope, old, new) = (scope.trim(), options.old.trim(), options.new.trim());
    if scope.is_empty() || old.is_empty() || new.is_empty() {
        return None;
    }
    if options.owner {
        scope
            .strip_prefix(old)
            .and_then(|rest| rest.strip_prefix('.'))
            .map(str::trim)
            .filter(|suffix| !suffix.is_empty())
            .map(|suffix| format!("{new}.{suffix}"))
    } else {
        (scope == old).then(|| new.to_owned())
    }
}
/// Collect per-component rename [`crate::component_rename::Options`] for `.bitmap` entries matching `options.old`.
pub(super) fn entries_with_default(
    bitmap: &Value,
    default_scope: &str,
    options: &Options,
) -> io::Result<Vec<crate::component_rename::Options>> {
    let rows = bitmap
        .as_object()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| io::Error::other("scope rename bitmap"))?;
    let default_scope = default_scope.trim();
    let mut entries = Vec::new();
    for (key, row) in rows {
        if is_skipped_row(key.trim(), row) {
            continue;
        }
        let (raw_scope, name) = row_scope_and_name(key, row);
        validate_entry_name(name)?;
        let current = if raw_scope.is_empty() { default_scope } else { raw_scope };
        let Some(target_scope) = scope(current, options) else { continue };
        entries.push(crate::component_rename::Options {
            source: format!("{current}/{name}"),
            target: name.into(),
            scope: Some(target_scope),
            preserve: options.preserve || options.owner,
            refactor: options.refactor,
            deprecate: options.deprecate,
            ..Default::default()
        });
    }
    Ok(entries)
}

/// Return `true` when `.bitmap` entry `(trimmed_key, row)` is a metadata key or inactive/removed component.
#[inline]
fn is_skipped_row(trimmed_key: &str, row: &Value) -> bool {
    trimmed_key.is_empty()
        || trimmed_key.starts_with('$')
        || matches!(trimmed_key, "_bit_lane" | "version")
        || !row["rootDir"].is_string()
        || row["isAvailableOnCurrentLane"] == false
        || crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
}

/// Extract the `(scope, name)` pair from `.bitmap` [`Value`] entry `(key, row)`.
fn row_scope_and_name<'a>(key: &'a str, row: &'a Value) -> (&'a str, &'a str) {
    let key = key.trim();
    let key_id = key.rsplit_once('@').map_or(key, |(bare, _)| bare.trim());
    let explicit_scope = row["scope"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
        });
    let (current, fallback_name) = if let Some(scope_name) = explicit_scope {
        let stripped = key_id
            .strip_prefix(scope_name)
            .and_then(|rest| rest.strip_prefix('/'))
            .map_or(key_id, str::trim);
        (scope_name, stripped)
    } else {
        key_id
            .split_once('/')
            .map_or(("", key_id), |(sc, rest)| (sc.trim(), rest.trim()))
    };
    let name = row["name"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback_name);
    (current, name)
}

#[inline]
fn validate_entry_name(name: &str) -> io::Result<()> {
    if name.trim().is_empty() {
        return Err(io::Error::other("scope rename component name is empty"));
    }
    Ok(())
}

pub(super) fn validate_scope(scope: &str) -> io::Result<()> {
    let mut dots = 0usize;
    let valid = scope.len() >= 2
        && !scope.starts_with('.')
        && !scope.ends_with('.')
        && scope
            .bytes()
            .all(|byte| {
                dots += usize::from(byte == b'.');
                dots <= 1
                    && (byte.is_ascii_lowercase()
                        || byte.is_ascii_digit()
                        || b"$-_!.".contains(&byte))
            });
    if valid {
        return Ok(());
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidInput,
        format!(
            r#"error: "{scope}" is invalid, component scope names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]"#,
        ),
    ))
}

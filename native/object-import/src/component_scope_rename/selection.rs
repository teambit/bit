use super::{Options, Value};
use std::io;
pub(super) fn scope(scope: &str, options: &Options) -> Option<String> {
    if options.owner {
        scope
            .strip_prefix(&format!("{}.", options.old))
            .map(|suffix| format!("{}.{suffix}", options.new))
    } else {
        (scope == options.old).then(|| options.new.clone())
    }
}
pub(super) fn entries(
    bitmap: &Value,
    options: &Options,
) -> io::Result<Vec<crate::component_rename::Options>> {
    let rows = bitmap.as_object().ok_or_else(|| io::Error::other("scope rename bitmap"))?;
    let mut entries = Vec::new();
    for (key, row) in rows {
        if !row["rootDir"].is_string()
            || row["isAvailableOnCurrentLane"] == false
            || crate::workspace::engine::client_status::config::is_config_removed(&row["config"])
        {
            continue;
        }
        let (current, name) = row_scope_and_name(key, row);
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

fn row_scope_and_name<'a>(key: &'a str, row: &'a Value) -> (&'a str, &'a str) {
    let key_id = key.rsplit_once('@').map_or(key, |(bare, _)| bare);
    let (key_scope, key_name) = key_id
        .split_once('/')
        .map_or((None, key_id), |(scope_part, name_part)| (Some(scope_part), name_part));
    let current = row["scope"]
        .as_str()
        .filter(|value| !value.is_empty())
        .or_else(|| {
            row["defaultScope"]
                .as_str()
                .filter(|value| !value.is_empty())
        })
        .or(key_scope)
        .unwrap_or_default();
    let name = row["name"]
        .as_str()
        .filter(|value| !value.is_empty())
        .unwrap_or(key_name);
    (current, name)
}

pub(super) fn validate_scope(scope: &str) -> io::Result<()> {
    let valid = scope.len() >= 2
        && !scope.starts_with('.')
        && !scope.ends_with('.')
        && scope
            .bytes()
            .filter(|byte| *byte == b'.')
            .count()
            <= 1
        && scope
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"$-_!.".contains(&byte)
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

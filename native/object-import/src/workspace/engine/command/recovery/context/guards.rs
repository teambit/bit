//! Extension identity uniqueness guards via [`extensions`], [`extension_identity`], and [`parse_extension_value`] for recovered `Version` objects.

use super::{Value, invalid, io};
/// Verifies that every recovered `Version` in `context["versions"]` has unique [`extension_identity`] entries.
#[inline]
pub(super) fn extensions(context: &Value) -> io::Result<()> {
    for version in context["versions"].as_array().ok_or_else(|| invalid("recovery versions"))? {
        let Some(rows) = version[1]["extensions"].as_array() else { continue };
        let mut seen = std::collections::HashSet::with_capacity(rows.len());
        for row in rows {
            let identity =
                extension_identity(row).ok_or_else(|| invalid("recovery extension identity"))?;
            if !seen.insert(identity) {
                return Err(invalid("recovery duplicate extension identity"));
            }
        }
    }
    Ok(())
}

/// Extracts the normalized `scope/name` or bare identity from an extension `row`.
#[inline]
fn extension_identity(row: &Value) -> Option<String> {
    [row.get("name"), row.get("legacyId"), row.get("extensionId"), row.get("id")]
        .into_iter()
        .flatten()
        .find_map(parse_extension_value)
}

/// Parses a string or `{ scope, name }` object `value` into a normalized extension identity.
#[inline]
fn parse_extension_value(value: &Value) -> Option<String> {
    if let Some(text) = value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        let bare = text.rsplit_once('@').map_or(text, |(base, _)| base.trim());
        return (!bare.is_empty()).then(|| {
            bare.split_once('/')
                .map_or_else(
                    || bare.to_owned(),
                    |(scope, part)| format!("{}/{}", scope.trim(), part.trim()),
                )
        });
    }
    let map = value
        .as_object()
        .filter(|map| !map.is_empty())?;
    let name = map
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|val| !val.is_empty())?;
    let bare = name.rsplit_once('@').map_or(name, |(base, _)| base.trim());
    if bare.is_empty() {
        return None;
    }
    let scope = map
        .get("scope")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|val| !val.is_empty());
    Some(scope.map_or_else(|| bare.to_owned(), |scope| format!("{scope}/{bare}")))
}

use super::{Value, invalid, io};
pub(super) fn extensions(context: &Value) -> io::Result<()> {
    for version in context["versions"].as_array().ok_or_else(|| invalid("recovery versions"))? {
        let mut seen = std::collections::HashSet::new();
        let Some(rows) = version[1]["extensions"].as_array() else { continue };
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

fn extension_identity(row: &Value) -> Option<String> {
    [row.get("name"), row.get("legacyId"), row.get("extensionId"), row.get("id")]
        .into_iter()
        .flatten()
        .find_map(|value| {
            if let Some(text) = value
                .as_str()
                .map(str::trim)
                .filter(|text| !text.is_empty())
            {
                let bare = text.rsplit_once('@').map_or(text, |(base, _)| base.trim());
                return (!bare.is_empty()).then(|| bare.to_owned());
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
            let scope = map
                .get("scope")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|val| !val.is_empty());
            Some(scope.map_or_else(|| bare.to_owned(), |scope| format!("{scope}/{bare}")))
        })
}

use super::{Value, invalid, io};
pub(super) fn extensions(context: &Value) -> io::Result<()> {
    for version in context["versions"].as_array().ok_or_else(|| invalid("recovery versions"))? {
        let mut seen = std::collections::HashSet::new();
        let Some(rows) = version[1]["extensions"].as_array() else { continue };
        for row in rows {
            let identity =
                extension_identity(row).ok_or_else(|| invalid("recovery extension identity"))?;
            if !seen.insert(identity.to_string()) {
                return Err(invalid("recovery duplicate extension identity"));
            }
        }
    }
    Ok(())
}

fn extension_identity(row: &Value) -> Option<&Value> {
    [row.get("name"), row.get("legacyId"), row.get("extensionId"), row.get("id")]
        .into_iter()
        .flatten()
        .find(|value| {
            !value.is_null()
                && value
                    .as_str()
                    .is_none_or(|text| !text.trim().is_empty())
        })
}

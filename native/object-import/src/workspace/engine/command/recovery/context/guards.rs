use super::{Value, invalid, io};
pub(super) fn extensions(context: &Value) -> io::Result<()> {
    for version in context["versions"].as_array().ok_or_else(|| invalid("recovery versions"))? {
        let mut seen = std::collections::HashSet::new();
        let Some(rows) = version[1]["extensions"].as_array() else { continue };
        for row in rows {
            let identity = row
                .get("name")
                .or_else(|| row.get("legacyId"))
                .or_else(|| row.get("extensionId"))
                .or_else(|| row.get("id"))
                .ok_or_else(|| invalid("recovery extension identity"))?;
            if !seen.insert(identity.to_string()) {
                return Err(invalid("recovery duplicate extension identity"));
            }
        }
    }
    Ok(())
}

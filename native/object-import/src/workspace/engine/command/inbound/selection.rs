//! Resolve explicit import identifiers and tracked scoped bitmap targets.
use super::{Target, invalid};
use crate::workspace::engine::client_status::config;
use std::{io, path::Path};

pub(super) fn bitmap_targets(root: &Path) -> io::Result<Vec<Target>> {
    let bitmap = config::document(&root.join(".bitmap"))?;
    let rows = bitmap.as_object().ok_or_else(|| invalid("inbound bitmap"))?;
    let mut targets = Vec::new();
    for (key, row) in rows {
        if key.starts_with('$')
            || matches!(key.as_str(), "_bit_lane" | "version")
            || !row.is_object()
        {
            continue;
        }
        let Some(scope) = row["scope"]
            .as_str()
            .filter(|scope| !scope.is_empty())
        else {
            continue;
        };
        let (_, name) = crate::reset_lane::bitmap::row_identity(key, row);
        if name.is_empty() {
            return Err(invalid("inbound bitmap name"));
        }
        let version = row["version"]
            .as_str()
            .filter(|ver| !ver.is_empty())
            .or_else(|| key.rsplit_once('@').map(|(_, ver)| ver))
            .ok_or_else(|| invalid("inbound bitmap version"))?;
        targets.push(Target {
            scope: Some(scope.to_owned()),
            name: name.to_owned(),
            version: version.to_owned(),
        });
    }
    Ok(targets)
}
pub(super) fn requested_target(id: &str) -> io::Result<Target> {
    let (scope, rest) = id.split_once('/').ok_or_else(|| invalid("inbound unscoped id"))?;
    let (name, version) = rest
        .rsplit_once('@')
        .unwrap_or((rest, "latest"));
    if scope.is_empty() || name.is_empty() || name.contains('*') || version.is_empty() {
        return Err(invalid("inbound unsupported id"));
    }
    Ok(Target { scope: Some(scope.to_owned()), name: name.to_owned(), version: version.to_owned() })
}

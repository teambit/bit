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
        let (row_scope, name) = crate::reset_lane::bitmap::row_identity(key, row);
        let Some(scope) = row_scope.filter(|scope| !scope.is_empty()) else {
            continue;
        };
        if name.is_empty() {
            return Err(invalid("inbound bitmap name"));
        }
        let raw_version = row["version"]
            .as_str()
            .filter(|ver| !ver.is_empty())
            .or_else(|| {
                key.rsplit_once('@')
                    .map(|(_, ver)| ver)
                    .filter(|ver| !ver.is_empty())
            })
            .unwrap_or("latest");
        let version = if raw_version == "head" { "latest" } else { raw_version };
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
    let (name, raw_version) = rest
        .rsplit_once('@')
        .unwrap_or((rest, "latest"));
    if scope.is_empty() || name.is_empty() || name.contains('*') || raw_version.is_empty() {
        return Err(invalid("inbound unsupported id"));
    }
    let version = if raw_version == "head" { "latest" } else { raw_version };
    Ok(Target { scope: Some(scope.to_owned()), name: name.to_owned(), version: version.to_owned() })
}

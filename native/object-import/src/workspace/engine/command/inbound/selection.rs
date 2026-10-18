//! Resolve explicit import identifiers and tracked scoped bitmap targets.
use super::{Target, invalid};
use crate::workspace::engine::client_status::config;
use std::{io, path::Path};

pub(super) fn bitmap_targets(root: &Path) -> io::Result<Vec<Target>> {
    let bitmap = config::document(&root.join(".bitmap"))?;
    let rows = bitmap.as_object().ok_or_else(|| invalid("inbound bitmap"))?;
    let mut targets = Vec::new();
    for (key, row) in rows {
        if key == "$schema-version" {
            continue;
        }
        let Some(scope) = row["scope"]
            .as_str()
            .filter(|scope| !scope.is_empty())
        else {
            continue;
        };
        let name = row["name"].as_str().ok_or_else(|| invalid("inbound bitmap name"))?;
        let version = row["version"].as_str().ok_or_else(|| invalid("inbound bitmap version"))?;
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

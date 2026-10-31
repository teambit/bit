//! Shape the inbound import loader rows to the source CLI's prefetch phases.
use super::Target;
use crate::command_import::PreparedImport;
use serde_json::{Value, json};
use std::collections::HashSet;

pub(super) fn rows(
    import: &PreparedImport,
    roots: &[Target],
    depth: bool,
    head_dependencies: bool,
) -> Vec<Value> {
    let mut progress = import.progress
        .iter()
        .map(|row| {
            json!({
                "reason":row.reason,"ids":row.ids,"requested":row.requested,
                "components":row.components.len(),"objects":row.objects.len(),
                "objectRequest":row.object_request,
            })
        })
        .collect::<Vec<_>>();
    if !depth && !head_dependencies {
        return progress;
    }
    let latest_roots = roots
        .iter()
        .filter(|root| root.version == "latest")
        .count()
        * usize::from(depth);
    let object_phase = depth && (head_dependencies || latest_roots > 0);
    let scopes = roots
        .iter()
        .filter_map(|root| root.scope.as_deref())
        .collect::<HashSet<_>>()
        .len();
    for row in &mut progress {
        adjust(row, roots, latest_roots, object_phase, head_dependencies, scopes);
    }
    progress
}

fn adjust(
    row: &mut Value,
    roots: &[Target],
    latest_roots: usize,
    object_phase: bool,
    head_dependencies: bool,
    scopes: usize,
) {
    if latest_roots > 0 && row["reason"] == "of their latest on main" {
        row["components"] = json!(
            row["components"]
                .as_u64()
                .unwrap_or(0)
                .saturating_sub(latest_roots as u64)
        );
        return;
    }
    if !(object_phase || head_dependencies)
        || row["reason"] != "for getting missing versions and dependencies"
    {
        return;
    }
    row["ids"] = json!(
        roots
            .iter()
            .map(format_target_id)
            .collect::<Vec<_>>()
    );
    row["components"] = json!(if object_phase { 0 } else { roots.len() });
    row["objects"] = json!(if object_phase { scopes } else { 0 });
}

fn format_target_id(root: &Target) -> String {
    let (name, version) = (root.name.trim(), root.version.trim());
    match root.scope
        .as_deref()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
    {
        Some(scope) => format!("{scope}/{name}@{version}"),
        None => format!("{name}@{version}"),
    }
}

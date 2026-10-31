//! Supported workspace policy shapes for dependency debug output.

use super::{ManualPolicy, NODE_DEV, manual_version};
use crate::commands::scope_set::Failure;
use serde_json::{Map, Value};
use std::collections::HashSet;

pub(super) fn parse_manual_fields(fields: &Map<String, Value>) -> Result<ManualPolicy, Failure> {
    let mut manual = ManualPolicy::default();
    for (field, values) in fields {
        append_manual_field(&mut manual, field, values)?;
    }
    manual.unresolved_runtime_plus.sort();
    manual.unresolved_dev_plus.sort();
    manual.unresolved_peer_plus.sort();
    if !manual.unresolved_peer_plus.is_empty() && unsupported_peer_plus_mix(&manual) {
        return Err(Failure::Declined("mixed peer plus deps debug policy delegated".into()));
    }
    apply_lifecycle_precedence(&mut manual);
    Ok(manual)
}

fn unsupported_peer_plus_mix(manual: &ManualPolicy) -> bool {
    let groups = [&manual.runtime, &manual.dev, &manual.peer];
    let populated = groups
        .iter()
        .filter(|group| !group.is_empty())
        .count();
    let duplicate = manual.unresolved_peer_plus
        .iter()
        .any(|name| {
            groups
                .iter()
                .any(|group| {
                    group
                        .iter()
                        .any(|(entry, _)| entry == name)
                })
        });
    let mut seen = HashSet::new();
    let duplicate_plus = manual.unresolved_runtime_plus
        .iter()
        .chain(&manual.unresolved_dev_plus)
        .chain(&manual.unresolved_peer_plus)
        .any(|name| !seen.insert(name));
    let supported_mix = supported_plus_mix(manual);
    (populated > 1 && !manual.peer.is_empty() && !supported_mix)
        || (populated > 0
            && (!manual.unresolved_runtime_plus.is_empty()
                || !manual.unresolved_dev_plus.is_empty())
            && !supported_mix)
        || duplicate
        || duplicate_plus
}

fn supported_plus_mix(manual: &ManualPolicy) -> bool {
    let supported_runtime_mix = !manual.runtime.is_empty()
        && !manual.unresolved_runtime_plus.is_empty()
        && manual.unresolved_dev_plus.is_empty();
    let supported_dev_mix = !manual.dev.is_empty()
        && manual.unresolved_runtime_plus.is_empty()
        && !manual.unresolved_dev_plus.is_empty();
    let supported_both_mix = !manual.runtime.is_empty()
        && !manual.dev.is_empty()
        && !manual.unresolved_runtime_plus.is_empty()
        && !manual.unresolved_dev_plus.is_empty();
    supported_runtime_mix || supported_dev_mix || supported_both_mix
}

fn append_manual_field(
    manual: &mut ManualPolicy,
    field: &str,
    values: &Value,
) -> Result<(), Failure> {
    let target = match field {
        "dependencies" => &mut manual.runtime,
        "devDependencies" => &mut manual.dev,
        "peerDependencies" => &mut manual.peer,
        _ => return Err(Failure::Declined("unsupported component deps debug field".into())),
    };
    let ignored = values
        .as_object()
        .into_iter()
        .flat_map(|entries| entries.iter())
        .filter(|(_, value)| value.as_str() == Some("-"))
        .map(|(name, _)| name.clone())
        .collect::<Vec<_>>();
    manual.ignored_names.extend(ignored);
    manual.ignored_env_dependencies.extend(
        NODE_DEV
            .iter()
            .filter(|(name, _)| {
                field == "devDependencies" && values.get(*name).and_then(Value::as_str) == Some("-")
            })
            .map(|(name, _)| (*name).to_owned()),
    );
    let plus = unresolved_plus(values);
    match field {
        "dependencies" => manual.unresolved_runtime_plus.extend(plus),
        "devDependencies" => manual.unresolved_dev_plus.extend(plus),
        _ => manual.unresolved_peer_plus.extend(plus),
    }
    target.extend(parse_manual_entries(values)?);
    Ok(())
}

fn parse_manual_entries(values: &Value) -> Result<Vec<(String, String)>, Failure> {
    let Some(entries) = values.as_object() else {
        return Err(Failure::Declined("unsupported component deps debug policy".into()));
    };
    let mut rows = entries
        .iter()
        .map(|(name, value)| {
            let version = manual_version(value)
                .map(str::trim)
                .ok_or_else(|| {
                    Failure::Declined("unsupported component deps debug version".into())
                })?;
            let name = name.trim();
            if name.is_empty() || version.is_empty() {
                return Err(Failure::Declined("unsupported component deps debug entry".into()));
            }
            Ok((version != "-" && version != "+").then(|| (name.to_owned(), version.to_owned())))
        })
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    rows.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(rows)
}

pub(super) fn apply_lifecycle_precedence(manual: &mut ManualPolicy) {
    let peer_names = manual.peer
        .iter()
        .map(|(name, _)| name.as_str())
        .collect::<HashSet<_>>();
    manual.dev.retain(|(name, _)| !peer_names.contains(name.as_str()));
    let dev_names = manual.dev
        .iter()
        .map(|(name, _)| name.as_str())
        .collect::<HashSet<_>>();
    let dev_plus_names = manual.unresolved_dev_plus
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    manual.runtime.retain(|(name, _)| {
        !dev_names.contains(name.as_str()) && !peer_names.contains(name.as_str())
    });
    manual.unresolved_runtime_plus.retain(|name| {
        !dev_names.contains(name.as_str())
            && !peer_names.contains(name.as_str())
            && !dev_plus_names.contains(name.as_str())
    });
    manual.unresolved_dev_plus.retain(|name| !peer_names.contains(name.as_str()));
}

fn unresolved_plus(values: &Value) -> Vec<String> {
    values
        .as_object()
        .into_iter()
        .flat_map(|entries| entries.iter())
        .filter(|(_, value)| value.as_str() == Some("+"))
        .map(|(name, _)| name.clone())
        .collect()
}

pub(super) fn supported_policy(policy: &Value) -> bool {
    policy.is_null()
        || policy
            .as_object()
            .is_some_and(|map| {
                map.iter()
                    .all(|(key, value)| {
                        matches!(
                            key.as_str(),
                            "dependencies" | "devDependencies" | "peerDependencies",
                        ) && value
                            .as_object()
                            .is_some_and(|entries| entries.values().all(Value::is_string))
                    })
            })
}

pub(super) fn empty_policy(policy: &Value) -> bool {
    policy.is_null()
        || policy
            .as_object()
            .is_some_and(|fields| {
                fields
                    .values()
                    .all(|entries| entries.as_object().is_some_and(Map::is_empty))
            })
}

pub(super) fn manual_entries(policy: &Map<String, Value>) -> Result<ManualPolicy, Failure> {
    if policy.is_empty() || !supported_fields(policy) || !supported_entries(policy) {
        return Err(Failure::Declined("configured versioned deps debug delegated".into()));
    }
    parse_manual_fields(policy)
}

fn supported_fields(policy: &Map<String, Value>) -> bool {
    policy
        .keys()
        .all(|field| {
            matches!(field.as_str(), "dependencies" | "devDependencies" | "peerDependencies")
        })
}

fn supported_entries(policy: &Map<String, Value>) -> bool {
    let mut seen = HashSet::new();
    for (field, group) in policy {
        let Some(entries) = group.as_object() else { return false };
        if entries.is_empty() {
            return false;
        }
        for (name, value) in entries {
            if !valid_entry(field, name, value, &mut seen) {
                return false;
            }
        }
    }
    true
}

fn valid_entry<'a>(field: &str, name: &'a str, value: &Value, seen: &mut HashSet<&'a str>) -> bool {
    let Some(version) = manual_version(value) else { return false };
    if name.trim().is_empty() || !seen.insert(name) || version.trim().is_empty() {
        return false;
    }
    if NODE_DEV
        .iter()
        .any(|(builtin, _)| name == *builtin)
    {
        return field == "devDependencies" && version == "-";
    }
    true
}

use super::{array, invalid, semver, text};
use serde_json::{Value, json};
use std::io;

const FIELDS: [&str; 3] = ["dependencies", "devDependencies", "peerDependencies"];
type Groups = Vec<(String, Vec<(String, String)>)>;
#[derive(Default)]
struct Plan {
    changes: Vec<Value>,
    updates: Vec<Value>,
    conflicts: serde_json::Map<String, Value>,
    unchanged: Vec<Value>,
    remove_packages: Vec<String>,
    debug: Vec<String>,
}
pub(super) fn plan(input: &Value) -> io::Result<Value> {
    let records = array(input, "records")?;
    let ordinary = aggregate(records, "mergedPolicy")?;
    let conflicted = aggregate(records, "conflict")?;
    let mut policy = input["policy"].clone();
    let mut plan = Plan::default();
    for (name, uses) in ordinary {
        ordinary_package(&mut plan, &mut policy, &name, &uses)?;
    }
    for (name, uses) in conflicted {
        conflict_package(&mut plan, &policy, &input["semver"], &name, &uses)?;
    }
    Ok(
        json!({"changes":plan.changes,"updates":plan.updates,"conflicts":plan.conflicts,"unchanged":plan.unchanged,"removePackages":plan.remove_packages,"debug":plan.debug}),
    )
}
fn aggregate(records: &[Value], field: &str) -> io::Result<Groups> {
    let mut groups: Groups = Vec::new();
    for record in records {
        aggregate_record(&mut groups, record, field)?;
    }
    if groups.len() > 4096 {
        return Err(invalid("config aggregation budget"));
    }
    groups.sort_by_key(|(name, _)| {
        name.parse::<u32>()
            .ok()
            .filter(|number| *number != u32::MAX && number.to_string() == *name)
            .map_or((1, 0), |number| (0, number))
    });
    Ok(groups)
}
fn aggregate_record(groups: &mut Groups, record: &Value, field: &str) -> io::Result<()> {
    let component = text(record, "compId")?;
    for dependency_field in FIELDS {
        let Some(entries) = record[field][dependency_field].as_array() else {
            continue;
        };
        if entries.len() > 4096 {
            return Err(invalid("config aggregation budget"));
        }
        aggregate_entries(groups, entries, component)?;
    }
    Ok(())
}

fn aggregate_entries(groups: &mut Groups, entries: &[Value], component: &str) -> io::Result<()> {
    for entry in entries {
        if entry["force"] == true {
            continue;
        }
        let name = text(entry, "name")?;
        let version = text(entry, "version")?;
        if let Some((_, uses)) = groups
            .iter_mut()
            .find(|(key, _)| key == name)
        {
            uses.push((component.into(), version.into()));
        } else {
            groups.push((name.into(), vec![(component.into(), version.into())]));
        }
    }
    Ok(())
}

fn ordinary_package(
    plan: &mut Plan,
    policy: &mut Value,
    name: &str,
    uses: &[(String, String)],
) -> io::Result<()> {
    for field in FIELDS {
        let Some(current) = policy[field][name]
            .as_str()
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
        else {
            continue;
        };
        if !same(uses) {
            put(&mut plan.unchanged, name, &report(uses));
            continue;
        }
        let version = &uses[0].1;
        if current == *version {
            continue;
        }
        put_update(&mut plan.updates, name, &current, version);
        plan.changes.push(json!({"field":field,"name":name,"version":version}));
        policy[field][name] = json!(version);
        plan.debug.push(format!(
            "update workspace.jsonc: {name} from {current} to {version}. Triggered by: {}",
            components(uses),
        ));
    }
    Ok(())
}
fn conflict_package(
    plan: &mut Plan,
    policy: &Value,
    semver: &Value,
    name: &str,
    uses: &[(String, String)],
) -> io::Result<()> {
    if !same(uses) {
        put(&mut plan.unchanged, name, &report(uses));
        return Ok(());
    }
    let raw = &uses[0].1;
    let (current, other_valid) = parse_conflict_versions(raw)?;
    for field in ["dependencies", "peerDependencies"] {
        let Some(workspace) = policy[field][name]
            .as_str()
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        plan.remove_packages.push(name.into());
        if semver::satisfies(semver, &other_valid, workspace)? {
            continue;
        }
        if let Some(rows) = plan.conflicts
            .entry(field)
            .or_insert_with(|| json!([]))
            .as_array_mut()
        {
            rows.push(
                json!({"name":name,"version":raw.replacen(current,workspace,1),"force":false}),
            );
        }
        plan.remove_packages.push(name.into());
        plan.debug.push(format!("conflict workspace.jsonc: {name} current: {workspace}, other: {other_valid}. Triggered by: {}", components(uses)));
    }
    Ok(())
}
fn parse_conflict_versions(raw: &str) -> io::Result<(&str, String)> {
    let mut parts = raw.split("::").skip(1);
    let current = parts
        .next()
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .ok_or_else(|| invalid("config conflict version"))?;
    let other = parts
        .next()
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .ok_or_else(|| invalid("config conflict version"))?;
    let other_valid =
        if (3..=40).contains(&other.len()) && other.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            format!("0.0.0-{other}")
        } else {
            other.into()
        };
    Ok((current, other_valid))
}
fn same(uses: &[(String, String)]) -> bool {
    uses.iter()
        .all(|(_, version)| *version == uses[0].1)
}
fn components(uses: &[(String, String)]) -> String {
    uses.iter()
        .map(|(component, _)| component.as_str())
        .collect::<Vec<_>>()
        .join(", ")
}
fn report(uses: &[(String, String)]) -> String {
    let mut versions: Groups = Vec::new();
    for (component, version) in uses {
        if let Some((_, entries)) = versions
            .iter_mut()
            .find(|(key, _)| key == version)
        {
            entries.push((component.clone(), version.clone()));
        } else {
            versions.push((version.clone(), vec![(component.clone(), version.clone())]));
        }
    }
    sort_versions(&mut versions);
    let details = versions
        .iter()
        .map(|(version, entries)| {
            let display = if version.contains("::") {
                version
                    .split("::")
                    .nth(2)
                    .unwrap_or("undefined")
            } else {
                version
            };
            let component = if entries.len() > 1 {
                format!("{} and {} more", entries[0].0, entries.len() - 1)
            } else {
                entries[0].0.clone()
            };
            format!("{display} (by {component})")
        })
        .collect::<Vec<_>>()
        .join(", ");
    format!("multiple versions found. {details}")
}
fn put(entries: &mut Vec<Value>, name: &str, value: &str) {
    if let Some(entry) = entries
        .iter_mut()
        .find(|entry| entry[0] == name)
    {
        *entry = json!([name, value]);
    } else {
        entries.push(json!([name, value]));
    }
}
fn put_update(entries: &mut Vec<Value>, name: &str, current: &str, value: &str) {
    if let Some(entry) = entries
        .iter_mut()
        .find(|entry| entry[0] == name)
    {
        *entry = json!([name, current, value]);
    } else {
        entries.push(json!([name, current, value]));
    }
}

fn sort_versions(versions: &mut Groups) {
    versions.sort_by_key(|(version, _)| {
        version
            .parse::<u32>()
            .ok()
            .filter(|number| *number != u32::MAX && number.to_string() == *version)
            .map_or((1, 0), |number| (0, number))
    });
}

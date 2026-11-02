//! Initial dependency state extraction via [`initial`] from cached pre-policy detection payloads.

use super::{invalid, issues};
use serde_json::{Value, json};
use std::io;

pub(super) fn initial(detected: &Value, finish: &Value) -> io::Result<Value> {
    if !detected["allDependencies"]["dependencies"].is_array()
        || !detected["allDependencies"]["devDependencies"].is_array()
        || !detected["allPackagesDependencies"].is_object()
    {
        return Err(invalid("status cached dependency collections"));
    }
    let mut entries = Vec::new();
    let mut components = vec![Vec::new(), Vec::new(), Vec::new()];
    for (index, field) in ["dependencies", "devDependencies", "peerDependencies"].iter().enumerate()
    {
        let Some(rows) = detected["allDependencies"].get(*field) else { continue };
        let rows =
            rows.as_array().ok_or_else(|| invalid("status cached component dependencies"))?;
        components[index].reserve(rows.len());
        entries.reserve(rows.len());
        for row in rows {
            components[index].push(entries.len());
            entries.push(entry(row)?);
        }
    }
    let packages: Vec<_> =
        ["packageDependencies", "devPackageDependencies", "peerPackageDependencies"]
            .iter()
            .map(|field| {
                detected["allPackagesDependencies"]
                    .get(field)
                    .cloned()
                    .unwrap_or_else(|| json!({}))
            })
            .collect();
    Ok(json!({"entries":entries,"components":components,"packages":packages,
        "ignored":ignored(finish)?,"missing":issues::missing(&detected["issues"])?}))
}

#[inline]
fn entry(row: &Value) -> io::Result<Value> {
    let range = row
        .get("versionRange")
        .filter(|val| !val.is_null())
        .or_else(|| row.get("peerVersionRange"))
        .cloned()
        .unwrap_or(Value::Null);
    let pkg_name = row["packageName"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty());
    Ok(json!({"identity":identity(&row["id"])?,"packageName":pkg_name,"versionRange":range}))
}

#[inline]
fn ignored(finish: &Value) -> io::Result<Vec<Vec<String>>> {
    let fields =
        finish["manual"].as_array().ok_or_else(|| invalid("status manual dependency policy"))?;
    if fields.len() != 3 {
        return Err(invalid("status manual dependency fields"));
    }
    fields
        .iter()
        .map(|field| {
            let map = field.as_object().ok_or_else(|| invalid("status manual dependency map"))?;
            Ok(map
                .iter()
                .filter(|(_, version)| version.as_str().map(str::trim) == Some("-"))
                .map(|(name, _)| name.trim().to_owned())
                .filter(|name| !name.is_empty())
                .collect())
        })
        .collect()
}

fn identity(value: &Value) -> io::Result<String> {
    if let Some(raw) = value.as_str().map(str::trim) {
        let (bare, ver) = raw
            .rsplit_once('@')
            .map_or((raw, None), |(bare, ver)| (bare.trim(), Some(ver.trim())));
        let (scope, name) = bare
            .split_once('/')
            .map(|(sc, nm)| (sc.trim(), nm.trim()))
            .filter(|(sc, nm)| !sc.is_empty() && !sc.contains('/') && !nm.is_empty())
            .ok_or_else(|| invalid("status cached dependency scope"))?;
        return Ok(match ver.filter(|ver| concrete_version(ver)) {
            Some(ver) => format!("{scope}/{name}@{ver}"),
            None => format!("{scope}/{name}"),
        });
    }
    let name = value["name"]
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| invalid("status cached dependency name"))?;
    let scope = value["scope"]
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty() && !text.contains('/'))
        .ok_or_else(|| invalid("status cached dependency scope"))?;
    let mut identity = format!("{scope}/{name}");
    if let Some(version) = value
        .get("version")
        .filter(|value| !value.is_null())
    {
        let version = version
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("status cached dependency version"))?;
        if concrete_version(version) {
            identity.push('@');
            identity.push_str(version);
        }
    }
    Ok(identity)
}

#[inline]
fn concrete_version(version: &str) -> bool {
    !version.is_empty()
        && !version.eq_ignore_ascii_case("latest")
        && !version.eq_ignore_ascii_case("head")
}

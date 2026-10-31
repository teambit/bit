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
        let empty = json!([]);
        let rows = detected["allDependencies"].get(field).unwrap_or(&empty);
        for row in rows.as_array().ok_or_else(|| invalid("status cached component dependencies"))? {
            components[index].push(entries.len());
            let range = row
                .get("versionRange")
                .filter(|val| !val.is_null())
                .or_else(|| row.get("peerVersionRange"))
                .cloned()
                .unwrap_or(Value::Null);
            entries.push(json!({"identity":identity(&row["id"])? ,
                "packageName":row["packageName"],"versionRange":range}));
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
                .filter(|(_, version)| *version == "-")
                .map(|(name, _)| name.clone())
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
            .filter(|(sc, nm)| !sc.is_empty() && !nm.is_empty())
            .ok_or_else(|| invalid("status cached dependency scope"))?;
        return Ok(match ver.filter(|ver| !ver.is_empty() && !matches!(*ver, "latest" | "head")) {
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
        .filter(|text| !text.is_empty())
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
        if !version.is_empty() && !matches!(version, "latest" | "head") {
            identity.push('@');
            identity.push_str(version);
        }
    }
    Ok(identity)
}

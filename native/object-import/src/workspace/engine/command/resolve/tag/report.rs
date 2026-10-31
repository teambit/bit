use super::{Material, Retained, invalid};
use serde_json::{Value, json};
use std::{cmp::Ordering, io};

pub(in super::super) fn report(
    retained: &Retained,
    semver: &Value,
    selected: &[String],
    materials: &[Material],
    automatic: &[Value],
) -> io::Result<Value> {
    let tagged = selected
        .iter()
        .map(|id| versioned(id, materials))
        .collect::<io::Result<Vec<_>>>()?;
    let mut autos = automatic.to_vec();
    for row in &mut autos {
        row["id"] = json!(versioned(
            row["id"].as_str().ok_or_else(|| invalid("tag auto identity"))?,
            materials
        )?);
    }
    Ok(json!({"taggedComponents":tagged,"autoTaggedResults":autos,
        "newComponents":materials.iter().filter(|material| material.version_state.current_head.is_empty() && material.participation.selected).map(|material| &material.identity).collect::<Vec<_>>(),
        "isSoftTag":retained.tag.as_ref().is_some_and(|options| options.soft),"warnings":warnings(retained, semver, selected, materials)?,"totalComponentsCount":materials.len()}))
}

fn versioned(id: &str, materials: &[Material]) -> io::Result<String> {
    let material = materials
        .iter()
        .find(|material| material.identity == id)
        .ok_or_else(|| invalid("tag report material"))?;
    Ok(format!(
        "{}@{}",
        id,
        material.version_state.tagged_version
            .as_deref()
            .ok_or_else(|| invalid("tag report version"))?,
    ))
}

fn warnings(
    retained: &Retained,
    semver: &Value,
    selected: &[String],
    materials: &[Material],
) -> io::Result<Vec<String>> {
    let options = retained.tag.as_ref().ok_or_else(|| invalid("tag options absent"))?;
    let snap = retained.snap.as_ref().ok_or_else(|| invalid("tag snapshot options"))?;
    let Some(exact) = options.exact_version
        .as_deref()
        .filter(|_| {
            snap.unmodified
                && !snap.unmerged
                && !options.snapped
                && options.patterns.is_empty()
        })
    else {
        return Ok(Vec::new());
    };
    let target =
        semver[exact].get("version").ok_or_else(|| invalid("tag exact semver metadata"))?;
    let mut output = Vec::new();
    for identity in selected {
        let material = materials
            .iter()
            .find(|material| material.identity == *identity)
            .ok_or_else(|| invalid("tag warning material"))?;
        let Some(latest) = latest_tag(material, semver)? else { continue };
        if crate::config_merge::compare_versions(&semver[latest]["version"], target)?
            == Ordering::Greater
        {
            output.push(format!("warning: {identity}@{latest} has a version greater than {exact}"));
        }
    }
    Ok(output)
}

fn latest_tag<'a>(material: &'a Material, semver: &Value) -> io::Result<Option<&'a str>> {
    let tags =
        material.model["versions"].as_object().ok_or_else(|| invalid("tag warning versions"))?;
    let orphaned = material.model["orphanedVersions"].as_object();
    let mut latest: Option<&str> = None;
    for tag in tags
        .keys()
        .chain(orphaned.into_iter().flat_map(serde_json::Map::keys))
    {
        let candidate =
            semver[tag].get("version").ok_or_else(|| invalid("tag stored semver metadata"))?;
        if latest.is_none()
            || crate::config_merge::compare_versions(
                candidate,
                &semver[latest.unwrap()]["version"],
            )? == Ordering::Greater
        {
            latest = Some(tag);
        }
    }
    Ok(latest)
}

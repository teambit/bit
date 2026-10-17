//! Apply registry facts to semantic identities while retaining the selected snapshot batch.

use super::super::{Retained, State, invalid, publication};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashMap, io};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Overrides {
    token: String,
    versions: HashMap<String, String>,
    semver: Value,
}

pub(in crate::workspace::engine) fn apply(
    input: &Overrides,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained = state.resolve.as_mut().ok_or_else(|| invalid("tag owner absent"))?;
    if retained.record.token != input.token
        || retained.tag
            .as_ref()
            .is_none_or(|options| {
                options.soft
                    || options.exact_version.is_some()
                    || options.versions_file.is_some()
            })
        || retained.snap.as_ref().is_none_or(|options| !options.policy.skip_published_versions)
        || !matches!(retained.finalized, publication::Phase::Pending(_))
    {
        return Err(invalid("tag registry override state"));
    }
    let replacements = update(retained, input)?;
    super::super::tag_versions::update_ranges(&mut retained.materials)?;
    replace_ids(&mut retained.result, &replacements);
    Ok((input.versions.len(), json!({"token":retained.record.token,"result":retained.result})))
}

fn update(retained: &mut Retained, input: &Overrides) -> io::Result<HashMap<String, String>> {
    let mut replacements = HashMap::new();
    for (identity, version) in &input.versions {
        if input.semver[version]["version"].is_null() {
            return Err(invalid("tag registry version grammar"));
        }
        let material = retained.materials
            .iter_mut()
            .find(|material| material.identity == *identity)
            .ok_or_else(|| invalid("tag registry component outside batch"))?;
        if material.model["versions"].get(version).is_some() {
            return Err(invalid("tag registry version already exists"));
        }
        let old = material.version_state.tagged_version
            .replace(version.clone())
            .ok_or_else(|| invalid("tag registry semantic version absent"))?;
        replacements.insert(format!("{identity}@{old}"), format!("{identity}@{version}"));
    }
    Ok(replacements)
}

fn replace_ids(value: &mut Value, replacements: &HashMap<String, String>) {
    match value {
        Value::String(text) => {
            if let Some(replacement) = replacements.get(text) {
                *text = replacement.clone();
            }
        }
        Value::Array(items) => items.iter_mut().for_each(|item| replace_ids(item, replacements)),
        Value::Object(fields) => {
            fields.values_mut().for_each(|item| replace_ids(item, replacements));
        }
        _ => {}
    }
}

use super::{increment, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{cmp::Ordering, io};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    components: Vec<Component>,
    params: Params,
    semver: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Component {
    versions: Vec<String>,
    is_auto_tag: bool,
    is_auto_added_root: bool,
    next_version: Option<String>,
    next_pre_release: Option<String>,
    entered_version: Option<String>,
    tag_data: Option<Tag>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Tag {
    version_to_tag: String,
    prerelease_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Params {
    release_type: String,
    auto_tag_release_type: Option<String>,
    increment_by: f64,
    persist: bool,
    soft: bool,
    exact_version: Option<String>,
    pre_release_id: Option<String>,
    has_tag_data: bool,
}
struct Choice<'a> {
    release: &'a str,
    exact: Option<&'a str>,
    count: f64,
    pre: Option<&'a str>,
    soft: bool,
}

pub(super) fn plan(input: Value) -> io::Result<Value> {
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    if request.components.len() > 4096 {
        return Err(invalid("snapshot version count limit"));
    }
    let mut versions = Vec::new();
    for component in &request.components {
        let choice = choice(component, &request.params, &request.semver)?;
        versions.push(resolve(component, &choice, &request.semver)?);
    }
    Ok(json!({"versions":versions}))
}
fn choice<'a>(
    component: &'a Component,
    params: &'a Params,
    semver: &'a Value,
) -> io::Result<Choice<'a>> {
    if params.has_tag_data {
        return tagged(component, params, semver);
    }
    if params.persist
        && let Some(next) = component.next_version
            .as_deref()
            .map(str::trim)
            .filter(|text| !text.is_empty())
    {
        return raw(next, 1.0, component.next_pre_release.as_deref(), semver);
    }
    if component.is_auto_tag {
        return automatic(params);
    }
    if component.is_auto_added_root {
        return Ok(default_choice(params, "patch", None, params.soft));
    }
    if let Some(entered) = component.entered_version
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return raw(entered, 1.0, None, semver);
    }
    Ok(default_choice(params, &params.release_type, params.exact_version.as_deref(), params.soft))
}
fn default_choice<'a>(
    params: &'a Params,
    release: &'a str,
    exact: Option<&'a str>,
    soft: bool,
) -> Choice<'a> {
    Choice {
        release,
        exact,
        count: params.increment_by,
        pre: params.pre_release_id.as_deref(),
        soft,
    }
}
fn raw<'a>(
    text: &'a str,
    count: f64,
    pre: Option<&'a str>,
    semver: &'a Value,
) -> io::Result<Choice<'a>> {
    let text = text.trim();
    if matches!(text, "major" | "minor" | "patch" | "prerelease") {
        return Ok(Choice { release: text, exact: None, count, pre, soft: false });
    }
    if semver[text].get("version").is_some() {
        let normalized = semver[text]["canonicalText"]
            .as_str()
            .ok_or_else(|| invalid("snapshot canonical version text missing"))?;
        return Ok(Choice { release: "patch", exact: Some(normalized), count, pre, soft: false });
    }
    Err(invalid("snapshot unsupported version input"))
}
fn resolve(component: &Component, choice: &Choice<'_>, semver: &Value) -> io::Result<String> {
    if choice.soft {
        return Ok(choice.exact
            .filter(|text| !text.is_empty())
            .unwrap_or(choice.release)
            .to_owned());
    }
    if let Some(exact) = choice.exact.filter(|text| !text.is_empty()) {
        if component.versions
            .iter()
            .any(|version| version.trim() == exact)
            || !valid_exact(semver, exact)
        {
            return Err(invalid("snapshot invalid or existing exact version"));
        }
        return Ok(exact.to_owned());
    }
    if !choice.count.is_finite() || choice.count > 4096.0 {
        return Err(invalid("snapshot increment count limit"));
    }
    let mut version = latest(component, semver)?;
    let count = choice.count.ceil().max(1.0) as usize;
    for _ in 0..count {
        version = increment::increment(&version, choice.release, choice.pre)?;
    }
    increment::format(&version)
}
fn latest(component: &Component, semver: &Value) -> io::Result<Value> {
    if component.versions.len() > 4096 {
        return Err(invalid("snapshot tag count limit"));
    }
    let mut latest = json!({"major":0,"minor":0,"patch":0,"prerelease":[]});
    let mut initialized = false;
    for tag in &component.versions {
        let tag = tag.trim();
        let candidate =
            semver[tag].get("version").ok_or_else(|| invalid("snapshot invalid stored tag"))?;
        if !initialized
            || crate::config_merge::compare_versions(candidate, &latest)? == Ordering::Greater
        {
            latest = candidate.clone();
            initialized = true;
        }
    }
    Ok(latest)
}
fn prelike(release: &str) -> bool {
    matches!(release, "prerelease" | "premajor" | "preminor" | "prepatch")
}

fn tagged<'a>(
    component: &'a Component,
    params: &'a Params,
    semver: &'a Value,
) -> io::Result<Choice<'a>> {
    if let Some(tag) = &component.tag_data {
        return raw(&tag.version_to_tag, params.increment_by, tag.prerelease_id.as_deref(), semver);
    }
    if !component.is_auto_added_root {
        return Err(invalid("snapshot missing tag data"));
    }
    Ok(default_choice(params, "patch", None, params.soft))
}

fn automatic(params: &Params) -> io::Result<Choice<'_>> {
    if let Some(release) = params.auto_tag_release_type
        .as_deref()
        .filter(|text| !text.is_empty())
    {
        return Ok(default_choice(params, release, None, params.soft));
    }
    if prelike(&params.release_type) {
        return Ok(default_choice(
            params,
            &params.release_type,
            if params.soft { None } else { params.exact_version.as_deref() },
            params.soft,
        ));
    }
    Ok(default_choice(params, "patch", None, params.soft))
}

fn valid_exact(semver: &Value, exact: &str) -> bool {
    semver[exact].get("version").is_some()
        || semver
            .as_object()
            .is_some_and(|entries| {
                entries
                    .values()
                    .any(|entry| {
                        entry["canonicalText"].as_str() == Some(exact)
                            && entry.get("version").is_some()
                    })
            })
}

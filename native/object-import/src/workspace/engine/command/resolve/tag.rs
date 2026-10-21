//! Mainline semantic-version planning reuses retained ordinary snapshot materials.
pub(in crate::workspace::engine) use published::{Overrides, apply as override_versions};
pub(super) use report::report;

use super::{
    super::{capture, invalid, repository, resolve_snapshot::Material},
    Plan, Retained, Selection,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, io};

mod published;
mod report;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::too_many_struct_fields,
        reason = "The commandTagPrepare wire schema keeps release and mode flags flat for strict deserialization"
    )
)]
pub(super) struct Options {
    pub patterns: Vec<String>,
    pub release_type: String,
    pub auto_tag_release_type: Option<String>,
    pub increment_by: f64,
    pub exact_version: Option<String>,
    pub pre_release_id: Option<String>,
    #[serde(default)]
    pub snapped: bool,
    #[serde(default)]
    pub skip_auto_tag: bool,
    #[serde(default)]
    pub soft: bool,
    #[serde(default)]
    pub persist: bool,
    pub versions_file: Option<Value>,
}

pub(super) fn select(
    retained: &mut Retained,
    captured: &[capture::Captured],
    input: &Plan,
) -> io::Result<Selection> {
    let options = retained.tag
        .as_ref()
        .ok_or_else(|| invalid("tag options absent"))?
        .clone();
    if options.persist {
        return select_persist(retained, &options, input);
    }
    let pending = candidate_selection(retained, captured)?;
    let candidates = &pending.identities;
    let snapped = head_snaps(retained, captured)?;
    let snap = retained.snap.as_ref().ok_or_else(|| invalid("tag snapshot options"))?;
    if !options.patterns.is_empty() {
        return filter_patterns(captured, candidates, &options.patterns, input);
    }
    if input.tag_selections.is_some() {
        return Err(invalid("tag unexpected selection receipt"));
    }
    if options.snapped {
        return Ok(Selection::unique(snapped));
    }
    if snap.unmerged {
        return super::selection::select(&retained.record.targets, &retained.pending, None)
            .map(Selection::unique);
    }
    Ok(pending)
}

pub(super) fn candidate_ids(
    retained: &mut Retained,
    captured: &[capture::Captured],
) -> io::Result<Vec<String>> {
    candidate_selection(retained, captured).map(|selection| selection.identities)
}

fn candidate_selection(
    retained: &mut Retained,
    captured: &[capture::Captured],
) -> io::Result<Selection> {
    let snap = retained.snap
        .as_ref()
        .ok_or_else(|| invalid("tag snapshot options"))?
        .clone();
    let mut candidates = super::snap::candidates(retained, captured, &snap)?;
    let snapped = head_snaps(retained, captured)?;
    let load_count = candidates
        .iter()
        .filter(|id| !super::snap::local_only(retained, id))
        .count()
        + snapped.len();
    for id in &snapped {
        if !candidates.contains(id) {
            candidates.push(id.clone());
        }
    }
    candidates.retain(|identity| !super::snap::local_only(retained, identity));
    Ok(Selection { identities: candidates, load_count })
}

fn select_persist(retained: &Retained, options: &Options, input: &Plan) -> io::Result<Selection> {
    if !options.patterns.is_empty() || options.snapped || input.tag_selections.is_some() {
        return Err(invalid("tag persist selection"));
    }
    let selected = retained.record.targets
        .iter()
        .filter(|target| target["softTagged"] == true)
        .map(|target| {
            target["identity"]
                .as_str()
                .ok_or_else(|| invalid("tag persist identity"))
                .map(str::to_owned)
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok(Selection::unique(selected))
}

fn head_snaps(retained: &Retained, captured: &[capture::Captured]) -> io::Result<Vec<String>> {
    let mut output = Vec::new();
    for current in captured {
        if super::snap::local_only(retained, &current.target.identity) {
            continue;
        }
        if retained.pending
            .iter()
            .any(|row| {
                super::selection::identity(&row["id"]).ok().as_deref()
                    == Some(current.target.identity.as_str())
            })
        {
            continue;
        }
        let Some(model) = repository::model(&retained.record.context, &current.target.identity)?
        else {
            continue;
        };
        let Some(head) = model["head"].as_str() else { continue };
        let tagged = model["versions"]
            .as_object()
            .ok_or_else(|| invalid("tag model versions"))?
            .values()
            .any(|value| value == head);
        if !tagged {
            output.push(current.target.identity.clone());
        }
    }
    Ok(output)
}

fn filter_patterns(
    captured: &[capture::Captured],
    candidates: &[String],
    patterns: &[String],
    input: &Plan,
) -> io::Result<Selection> {
    let rows =
        input.tag_selections.as_ref().ok_or_else(|| invalid("tag pattern receipt absent"))?;
    let known = captured
        .iter()
        .map(|current| current.target.identity.as_str())
        .collect::<HashSet<_>>();
    for row in rows {
        if !known.contains(row["identity"].as_str().ok_or_else(|| invalid("tag pattern identity"))?)
        {
            return Err(invalid("tag unknown selection"));
        }
    }
    pattern_order(candidates, patterns, rows)
}

fn pattern_order(
    candidates: &[String],
    patterns: &[String],
    rows: &[Value],
) -> io::Result<Selection> {
    let groups = pattern_groups(patterns.len(), rows)?;
    let mut output = Vec::new();
    let mut load_count = 0;
    for (pattern, matches) in patterns.iter().zip(groups) {
        let selected = selected_group(candidates, pattern, &matches)?;
        load_count += selected.len();
        for identity in selected {
            if !output.contains(&identity) {
                output.push(identity);
            }
        }
    }
    Ok(Selection { identities: output, load_count })
}

fn selected_group(
    candidates: &[String],
    pattern: &str,
    matches: &[&str],
) -> io::Result<Vec<String>> {
    let wildcard = pattern.contains(['*', ',', '!', '$', ':']);
    if !wildcard && matches.len() != 1 {
        return Err(invalid("tag literal pattern receipt"));
    }
    let selected = candidates
        .iter()
        .filter(|id| matches.contains(&id.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    if wildcard && selected.is_empty() {
        return Err(invalid("tag pattern excludes candidates"));
    }
    Ok(selected)
}

fn pattern_groups(count: usize, rows: &[Value]) -> io::Result<Vec<Vec<&str>>> {
    let mut groups = vec![Vec::new(); count];
    for row in rows {
        let index = row["patternIndex"]
            .as_u64()
            .and_then(|value| usize::try_from(value).ok())
            .filter(|index| *index < count)
            .ok_or_else(|| invalid("tag pattern index"))?;
        let identity = row["identity"].as_str().ok_or_else(|| invalid("tag pattern identity"))?;
        if groups[index].contains(&identity) {
            return Err(invalid("tag duplicate pattern match"));
        }
        groups[index].push(identity);
    }
    Ok(groups)
}

pub(super) fn versions(
    retained: &Retained,
    input: &Plan,
    materials: &mut [Material],
) -> io::Result<()> {
    let options = retained.tag.as_ref().ok_or_else(|| invalid("tag options absent"))?;
    let params = json!({"releaseType":options.release_type,"autoTagReleaseType":options.auto_tag_release_type,
        "incrementBy":options.increment_by,"exactVersion":options.exact_version,"preReleaseId":options.pre_release_id,
        "soft":options.soft,"persist":options.persist,"hasTagData":options.versions_file.is_some(),"versionsFile":options.versions_file,"autoAddedWorkspaceRoot":super::root::added(retained)});
    let mut entered = serde_json::Map::new();
    for row in input.tag_selections.as_deref().unwrap_or_default() {
        let id = row["identity"].as_str().ok_or_else(|| invalid("tag selected identity"))?;
        if !entered.contains_key(id) {
            entered.insert(id.into(), row["version"].clone());
        }
    }
    let next = retained.record.targets
        .iter()
        .filter_map(|target| {
            target["identity"]
                .as_str()
                .map(|identity| (identity.to_owned(), &target["nextVersion"]))
        })
        .collect();
    super::tag_versions::plan(materials, &params, &Value::Object(entered), &input.semver, &next)
}

#[cfg(test)]
mod tests;

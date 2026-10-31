//! Published export wildcard selection filters pending IDs before transferring objects.
use super::{Options, options};
use crate::commands::engine::Engine;
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn ids(engine: &mut Engine, root: &Path, options: &Options) -> io::Result<Vec<String>> {
    if !options.ids.iter().any(|id| options::is_pattern(id)) {
        return Ok(options.ids.clone());
    }
    let bitmap =
        bit_install::jsonc::Document::parse(&std::fs::read_to_string(root.join(".bitmap"))?)?;
    if is_non_main_lane(bitmap.get(&["_bit_lane"]).as_ref()) {
        return Ok(options.ids.clone());
    }
    let candidates: Value = engine.request(&json!({
        "kind":"commandOutboundCandidates", "root":root,
        "all":options.all || options.all_versions,
    }))?;
    let ids = candidate_ids(&candidates)?;
    let patterns = options.ids
        .iter()
        .map(|pattern| {
            regress::Regex::new(&format!("^{}$", pattern.replace('*', ".*")))
                .map_err(|error| io::Error::other(error.to_string()))
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok(ids
        .into_iter()
        .filter(|id| {
            patterns
                .iter()
                .any(|pattern| pattern.find(id).is_some())
        })
        .collect())
}

fn is_non_main_lane(lane: Option<&Value>) -> bool {
    let Some(lane) = lane else { return false };
    let name = lane
        .as_str()
        .or_else(|| lane["name"].as_str())
        .or_else(|| lane["id"].as_str())
        .or_else(|| lane["id"]["name"].as_str())
        .unwrap_or_default()
        .trim();
    !name.is_empty() && name.rsplit('/').next() != Some("main")
}

fn candidate_ids(candidates: &Value) -> io::Result<Vec<String>> {
    let rows = candidates["ids"]
        .as_array()
        .or_else(|| candidates["components"].as_array())
        .ok_or_else(|| io::Error::other("outbound candidate IDs"))?;
    rows.iter()
        .map(|row| {
            row.as_str()
                .or_else(|| row["id"].as_str())
                .or_else(|| row["identity"].as_str())
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| io::Error::other("outbound candidate ID"))
        })
        .collect()
}

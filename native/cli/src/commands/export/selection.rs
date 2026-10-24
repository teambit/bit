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
    if bitmap.get(&["_bit_lane"]).is_some() {
        return Ok(options.ids.clone());
    }
    let candidates: Value = engine.request(&json!({
        "kind":"commandOutboundCandidates", "root":root,
        "all":options.all || options.all_versions,
    }))?;
    let ids =
        candidates["ids"].as_array().ok_or_else(|| io::Error::other("outbound candidate IDs"))?;
    let ids = ids
        .iter()
        .map(|id| id.as_str().ok_or_else(|| io::Error::other("outbound candidate ID")))
        .collect::<io::Result<Vec<_>>>()?;
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
        .map(str::to_owned)
        .collect())
}

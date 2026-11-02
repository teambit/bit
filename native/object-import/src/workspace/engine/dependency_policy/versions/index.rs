//! Indexed bitmap, lane, model, and env-own [`Index`] lookups for [`Request`] version selection.

use super::{
    Request,
    wire::{unversioned, version},
};
use std::collections::{HashMap, HashSet};

/// Build once per calculation; dependency aliases still resolve in their original order.
/// Ambiguous bitmap entries map to `None` so downstream selectors do not pick a conflicting pin.
pub(super) struct Index<'a> {
    pub(super) request: &'a Request,
    pub(super) bitmap: HashMap<&'a str, Option<&'a str>>,
    pub(super) lane: HashMap<&'a str, &'a str>,
    pub(super) model: HashMap<&'a str, &'a str>,
    pub(super) env: HashSet<&'a str>,
}
impl<'a> Index<'a> {
    /// Builds an [`Index`] over bitmap, lane, model, and env-own version sources in `request`.
    /// Records `None` for any unversioned identity that appears more than once in `bitmap`.
    pub(super) fn new(request: &'a Request) -> Self {
        let mut bitmap = HashMap::with_capacity(request.sources.bitmap.len());
        for id in &request.sources.bitmap {
            let base = unversioned(id);
            if base.is_empty() {
                continue;
            }
            let ver = version(id).trim();
            bitmap
                .entry(base)
                .and_modify(|value| *value = None)
                .or_insert_with(|| pinned_version(ver).then_some(ver));
        }
        Self {
            request,
            bitmap,
            lane: first(&request.sources.lane),
            model: first(&request.sources.model),
            env: request.policy.env_own
                .iter()
                .map(String::as_str)
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .collect(),
        }
    }
}
/// Builds a first-seen unversioned-identity to pinned-version map from `ids`.
#[inline]
fn first(ids: &[String]) -> HashMap<&str, &str> {
    let mut index = HashMap::with_capacity(ids.len());
    for id in ids {
        let base = unversioned(id);
        let ver = version(id).trim();
        if !base.is_empty() && pinned_version(ver) {
            index.entry(base).or_insert(ver);
        }
    }
    index
}
/// Returns `true` when `ver` is a non-empty concrete version other than `"latest"` or `"head"`.
#[inline]
fn pinned_version(ver: &str) -> bool {
    !ver.is_empty() && !ver.eq_ignore_ascii_case("latest") && !ver.eq_ignore_ascii_case("head")
}

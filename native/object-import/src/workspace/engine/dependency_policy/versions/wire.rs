//! Wire [`Request`], [`Sources`], [`Policy`], and [`Grammar`] payloads for version selection.

use super::super::wire::Entry;
use serde::Deserialize;
use std::collections::HashMap;

/// Map of component or package identities to version strings.
type Versions = HashMap<String, String>;
/// Wire request for selecting resolved component and extension versions.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Request {
    pub(super) entries: Vec<Entry>,
    pub(super) components: [Vec<usize>; 3],
    pub(super) extensions: Vec<String>,
    pub(super) sources: Sources,
    pub(super) policy: Policy,
    pub(super) grammar: HashMap<String, Grammar>,
}
/// Bitmap, lane, model, and component-config version sources for version selection.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Sources {
    pub(super) bitmap: Vec<String>,
    pub(super) lane: Vec<String>,
    pub(super) model: Vec<String>,
    pub(super) component_config: Versions,
}
/// Manual, env-own, workspace, automatic, and merge version policies with optional range prefix.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Policy {
    pub(super) manual: [Versions; 3],
    pub(super) env_own: Vec<String>,
    pub(super) workspace: Versions,
    pub(super) automatic: [Versions; 3],
    pub(super) merge: [Versions; 3],
    pub(super) prefix: Option<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Grammar {
    pub(super) valid: bool,
    pub(super) range: bool,
    pub(super) coerced: Option<String>,
}
#[inline]
pub(super) fn unversioned(value: &str) -> &str {
    let trimmed = value.trim();
    trimmed
        .rsplit_once('@')
        .filter(|(_, ver)| !ver.contains('/'))
        .map(|(identity, _)| identity.trim())
        .filter(|identity| !identity.is_empty())
        .unwrap_or(trimmed)
}
#[inline]
pub(super) fn version(value: &str) -> &str {
    let trimmed = value.trim();
    trimmed
        .rsplit_once('@')
        .filter(|(identity, ver)| !identity.trim().is_empty() && !ver.contains('/'))
        .map(|(_, version)| version.trim())
        .filter(|version| !version.is_empty())
        .unwrap_or("latest")
}
#[inline]
pub(super) fn identity(base: &str, version: &str) -> String {
    let base = unversioned(base);
    let version = version.trim();
    if version.is_empty()
        || version.eq_ignore_ascii_case("latest")
        || version.eq_ignore_ascii_case("head")
    {
        base.to_owned()
    } else {
        format!("{base}@{version}")
    }
}
#[inline]
pub(super) fn snap(value: &str) -> bool {
    let value = value.trim();
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}
impl Policy {
    #[inline]
    pub(super) fn ranges(&self) -> bool {
        self.prefix
            .as_deref()
            .map(str::trim)
            .is_some_and(|prefix| !prefix.is_empty() && prefix != "-")
    }
}

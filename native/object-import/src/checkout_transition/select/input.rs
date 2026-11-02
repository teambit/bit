//! Wire request types ([`Begin`], [`Component`], [`Options`]) and validation for checkout selection transitions.

use super::invalid;
use serde::Deserialize;
use serde_json::Value;
use std::io;
/// Initial checkout selection request payload containing [`Component`], [`Model`], and [`Options`].
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Begin {
    pub(super) component: Component,
    pub(super) model: Option<Model>,
    pub(super) options: Options,
}
/// Component metadata descriptor in a checkout selection request.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Component {
    pub(super) id: String,
    pub(super) id_without_version: String,
    #[serde(rename = "componentVersion")]
    pub(super) version: Option<String>,
    pub(super) has_bitmap: bool,
    pub(super) current_exists: bool,
    pub(super) is_removed: bool,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Model {
    pub(super) has_main_head: bool,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Options {
    #[serde(flatten)]
    pub(super) flags: Flags,
    pub(super) ancestor: Option<usize>,
    pub(super) version: Option<String>,
    pub(super) version_per_id: Option<Value>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Flags {
    pub(super) reset: bool,
    pub(super) head: bool,
    pub(super) main: bool,
    pub(super) latest: bool,
    pub(super) force_ours: bool,
    pub(super) force_theirs: bool,
    pub(super) revert: bool,
    pub(super) load_stash: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Receipt {
    pub(super) token: String,
    pub(super) revision: u32,
    pub(super) observation: String,
    pub(super) value: Value,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CurrentObservation {
    pub(super) value: Option<String>,
    pub(super) has_bitmap: bool,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ModifiedObservation {
    pub(super) modified: bool,
    pub(super) is_removed: bool,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RemovedObservation {
    pub(super) removed: bool,
    pub(super) has_bitmap: bool,
}
#[inline]
pub(super) fn validate(request: &Begin) -> io::Result<()> {
    if invalid_id(&request.component.id)
        || invalid_id(&request.component.id_without_version)
        || request.options.ancestor.is_some_and(|count| count > 4096)
        || invalid_version(request.component.version.as_deref())
        || invalid_version(request.options.version.as_deref())
        || request.options.version_per_id
            .as_ref()
            .is_some_and(|value| {
                value
                    .as_object()
                    .is_none_or(|map| !map.is_empty())
            })
    {
        return Err(invalid("checkout select input budget"));
    }
    let _ = (
        &request.component.version,
        request.component.current_exists,
        request.component.has_bitmap,
        request.component.is_removed,
    );
    Ok(())
}

#[inline]
fn invalid_version(version: Option<&str>) -> bool {
    version.is_some_and(|value| {
        value.len() > 32768
            || value.chars().any(char::is_control)
            || (!value.is_empty() && value.trim().is_empty())
    })
}

#[inline]
fn invalid_id(value: &str) -> bool {
    value.len() > 32768 || value.trim().is_empty() || value.chars().any(char::is_control)
}

use super::invalid;
use serde::Deserialize;
use serde_json::Value;
use std::io;
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Begin {
    pub(super) component: Component,
    pub(super) model: Option<Model>,
    pub(super) options: Options,
}
#[derive(Clone, Deserialize)]
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
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Model {
    pub(super) has_main_head: bool,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Options {
    #[serde(flatten)]
    pub(super) flags: Flags,
    pub(super) ancestor: Option<usize>,
    pub(super) version: Option<String>,
    pub(super) version_per_id: Option<Value>,
}
#[derive(Clone, Deserialize)]
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

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Receipt {
    pub(super) token: String,
    pub(super) revision: u32,
    pub(super) observation: String,
    pub(super) value: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CurrentObservation {
    pub(super) value: Option<String>,
    pub(super) has_bitmap: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ModifiedObservation {
    pub(super) modified: bool,
    pub(super) is_removed: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RemovedObservation {
    pub(super) removed: bool,
    pub(super) has_bitmap: bool,
}
pub(super) fn validate(request: &Begin) -> io::Result<()> {
    if invalid_id(&request.component.id)
        || invalid_id(&request.component.id_without_version)
        || request.options.ancestor.is_some_and(|count| count > 4096)
        || request.component.version
            .as_ref()
            .is_some_and(|value| {
                value.len() > 32768
                    || value.contains('\0')
                    || (!value.is_empty() && value.trim().is_empty())
            })
        || request.options.version
            .as_ref()
            .is_some_and(|value| {
                value.len() > 32768
                    || value.contains('\0')
                    || (!value.is_empty() && value.trim().is_empty())
            })
        || request.options.version_per_id
            .as_ref()
            .is_some_and(|value| {
                !value.is_object()
                    || value
                        .as_object()
                        .is_some_and(|map| !map.is_empty())
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

fn invalid_id(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.is_empty() || value.len() > 32768 || value.chars().any(char::is_control)
}

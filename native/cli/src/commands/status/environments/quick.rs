//! Root provider startup for public quick status, without component hooks.
//!
//! [`run`] ([`core_aspect_ids`]) initializes [`Environments`] with [`root_aspects`] over [`Path`] roots for `bit status --quick`.

use super::{Environments, root_aspects};
use serde_json::json;
use std::{io, path::Path};

/// Loads root workspace aspect providers ([`root_aspects`]) for `bit status --quick` without hydrating component hooks.
pub(in crate::commands) fn run(
    root: &Path,
    home: &Path,
    startup: &mut crate::commands::status::autosync::Startup,
) -> io::Result<()> {
    let is_blank = |path: &Path| {
        path.as_os_str().is_empty()
            || path
                .to_str()
                .is_some_and(|text| text.trim().is_empty())
    };
    if is_blank(root) || is_blank(home) {
        return Err(io::Error::other("quick status root or home path is empty"));
    }
    let workspace = bit_object_import::effective_workspace_configuration(root, home)?;
    if workspace.as_object().is_none_or(serde_json::Map::is_empty) {
        return Ok(());
    }
    let core = core_aspect_ids()?;
    let aspects = root_aspects(&json!({"workspace":workspace}), &core);
    if aspects.is_empty() {
        return Ok(());
    }
    let mut environments = Environments::new();
    let host = environments.host(root)?;
    startup.committed = true;
    let result = host.call("dependencyPolicies", &json!({"extensionIds":aspects}));
    let stdout = host.take_stdout();
    if !stdout.is_empty() {
        startup.stdout.push_str(&stdout);
    }
    result.map(|_| ())
}

/// Deserializes the embedded `core-aspects-ids.json` list for [`run`].
#[inline]
fn core_aspect_ids() -> io::Result<Vec<String>> {
    serde_json::from_str(include_str!(
        "../../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))
    .map_err(io::Error::other)
}

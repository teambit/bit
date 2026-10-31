//! Root provider startup for public quick status, without component hooks.

use super::{Environments, root_aspects};
use serde_json::json;
use std::{io, path::Path};

/// Public status quick mode loads root providers but never hydrates component hooks.
pub(in crate::commands) fn run(
    root: &Path,
    home: &Path,
    startup: &mut crate::commands::status::autosync::Startup,
) -> io::Result<()> {
    let workspace = bit_object_import::effective_workspace_configuration(root, home)?;
    let core = core_aspect_ids()?;
    let aspects = root_aspects(&json!({"workspace":workspace}), &core);
    if aspects.is_empty() {
        return Ok(());
    }
    let mut environments = Environments::new();
    startup.committed = true;
    let host = environments.host(root)?;
    let result = host.call("dependencyPolicies", &json!({"extensionIds":aspects}));
    let stdout = host.take_stdout();
    if !stdout.is_empty() {
        startup.stdout.push_str(&stdout);
    }
    result.map(|_| ())
}

fn core_aspect_ids() -> io::Result<Vec<String>> {
    serde_json::from_str(include_str!(
        "../../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))
    .map_err(io::Error::other)
}

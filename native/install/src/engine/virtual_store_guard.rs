//! Refuse an install that would switch the workspace between the project-local
//! and the global virtual store while the running bit is installed inside this
//! workspace's `node_modules` (`assertSafeVirtualStoreTransition`).
//!
//! A layout switch rebuilds every injected component package from source, so a
//! bit running from those directories would lose its own compiled code
//! mid-install.

#[cfg(test)]
mod tests;

use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Fail when the switch would delete the running bit's own code.
pub(super) fn assert_safe_transition(
    root: &Path,
    enable_global_virtual_store: bool,
    bit_dir: &Path,
) -> io::Result<()> {
    let Ok(modules_manifest) = fs::read_to_string(root.join("node_modules").join(".modules.yaml"))
    else {
        return Ok(());
    };
    let Some(virtual_store_dir) = recorded_virtual_store_dir(&modules_manifest) else {
        return Ok(());
    };
    // Real paths on both sides: a workspace reached through a symlink must not
    // read its project-local store as global.
    let workspace = realpath(root);
    let store = realpath(&workspace.join("node_modules").join(virtual_store_dir));
    let current_is_global = !store.starts_with(&workspace);
    if current_is_global == enable_global_virtual_store {
        return Ok(());
    }
    if !realpath(bit_dir).starts_with(workspace.join("node_modules")) {
        return Ok(());
    }
    Err(io::Error::other(transition_message(root, enable_global_virtual_store)))
}

/// `parseRecordedVirtualStoreDir`: JSON `.modules.yaml`, or the block-YAML an
/// older pnpm wrote.
pub(super) fn recorded_virtual_store_dir(modules_manifest: &str) -> Option<String> {
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(modules_manifest) {
        return parsed
            .get("virtualStoreDir")
            .and_then(|value| value.as_str())
            .map(str::to_string);
    }
    modules_manifest.lines().find_map(yaml_virtual_store_dir)
}

fn yaml_virtual_store_dir(line: &str) -> Option<String> {
    let line = line.trim();
    let rest = line
        .strip_prefix(r#""virtualStoreDir""#)
        .or_else(|| line.strip_prefix("virtualStoreDir"))?;
    let value = rest
        .trim_start()
        .strip_prefix(':')?
        .trim();
    let value = value
        .strip_suffix(',')
        .unwrap_or(value)
        .trim_end();
    let value = value.strip_prefix('"').unwrap_or(value);
    let value = value.strip_suffix('"').unwrap_or(value);
    (!value.is_empty() && !value.contains('"')).then(|| value.to_string())
}

fn realpath(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// `SelfHostedVirtualStoreTransition`.
fn transition_message(workspace: &Path, enabling: bool) -> String {
    let direction = if enabling {
        "from the project-local virtual store to the global virtual store"
    } else {
        "from the global virtual store back to the project-local virtual store"
    };
    format!(
        r#"this install would switch "{}" {direction}, but the running bit is itself installed inside this workspace's node_modules.
The switch rebuilds this workspace's component packages from source, which would delete the running bit's compiled code mid-install and leave node_modules broken.
Run this one install with a bit installation that lives outside the workspace (e.g. a bvm-installed bit). Subsequent installs from within the workspace are safe in either layout."#,
        workspace.display(),
    )
}

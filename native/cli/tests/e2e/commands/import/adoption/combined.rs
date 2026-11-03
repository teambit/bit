//! End-to-end tests verifying owned source replacement ([`UPDATED`]) advances only its exact proofs before `--write-deps` recapture.
//!
//! Verifies [`command`], [`dependents`], and [`file`] across combined source and policy updates.

use super::{command, dependents, file};
use crate::{
    commands::move_paths::support,
    helper::{Helper, remote},
};
/// Updated source file contents written to `comp4` in [`stale_target`] before tagging its newer remote version.
const UPDATED: &str = "module.exports='new remote target version';\n";
/// Creates a workspace where `comp4` is checked out at `0.0.1` while `0.0.2` exists on the remote.
fn stale_target() -> Helper {
    let helper = dependents::graph();
    support::setup(&helper, &command(&helper, "comp4@0.0.1", ""));
    let entry = support::bitmap(&helper)["comp4"].clone();
    std::fs::write(file(&helper, &entry, "index.js"), UPDATED).unwrap();
    support::setup(&helper, "tag comp4 --ignore-issues * --message advanced-target");
    remote::publish(&helper);
    support::setup(&helper, "checkout 0.0.1 comp4 --force-theirs -x");
    let before = support::bitmap(&helper);
    assert_eq!(before["comp4"]["version"], "0.0.1");
    assert_ne!(
        std::fs::read(file(&helper, &before["comp4"], "index.js")).unwrap(),
        UPDATED.as_bytes(),
    );
    helper
}
/// Verifies `--override --dependents --write-deps package.json` updates `comp4` to [`UPDATED`].
#[test]
fn override_dependents_then_package_dependency_writes_keep_the_exact_owned_source_transition() {
    combined("package.json");
}
/// Verifies `--override --dependents --write-deps workspace.jsonc` updates `comp4` to [`UPDATED`].
#[test]
fn override_dependents_then_workspace_dependency_writes_keep_the_exact_owned_source_transition() {
    combined("workspace.jsonc");
}
/// Runs `bit import comp4 --override --dependents --write-deps <target>` on [`stale_target`] and asserts [`UPDATED`] parity.
fn combined(target: &str) {
    let helper = stale_target();
    super::successful(
        &helper,
        &command(
            &helper,
            "comp4",
            &format!("--override --dependents --silent --write-deps {target}"),
        ),
    );
    let after = support::bitmap(&helper);
    assert_eq!(after["comp4"]["version"], "0.0.2");
    // AbstractVinyl.write uses eol.auto when materializing the imported Source.
    let expected = if cfg!(windows) { UPDATED.replace('\n', "\r\n") } else { UPDATED.to_owned() };
    assert_eq!(
        std::fs::read(file(&helper, &after["comp4"], "index.js")).unwrap(),
        expected.as_bytes(),
    );
    dependents::assert_components(
        &helper,
        &["comp1", "comp2", "comp3", "comp4", "comp-a", "comp-a2"],
    );
}

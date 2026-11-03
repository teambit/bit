//! Real environment hooks ([`delay`], [`SCOPE_DELAY_ENV`]) separate the published second-resolution mutation
//! backups for `scope rename` end-to-end tests.
use crate::{
    commands::move_paths::support::setup,
    helper::{Helper, config},
};

/// Scoped component ID of the delay environment aspect used to separate second-resolution backups ([`delay`]).
const SCOPE_DELAY_ENV: &str = "fixture.tools/env/scope-delay";

/// Registers and assigns the [`SCOPE_DELAY_ENV`] environment aspect to `names` ([`Helper`]).
pub(super) fn delay(helper: &Helper, names: &[&str]) {
    let source = include_str!("fixture.cjs");
    helper.output_file("scope-delay/index.js", source);
    setup(helper, "add scope-delay -i env/scope-delay");
    setup(helper, "scope set fixture.tools env/scope-delay");
    config::set_component_env(&helper.scopes.local_path, "env/scope-delay", "teambit.envs/env");
    setup(helper, "link");
    helper.output_file("scope-delay/dist/index.js", source);
    setup(helper, "tag env/scope-delay --ignore-issues * --message delay");
    for name in names {
        config::set_component_env(&helper.scopes.local_path, name, SCOPE_DELAY_ENV);
    }
    setup(helper, "link");
}

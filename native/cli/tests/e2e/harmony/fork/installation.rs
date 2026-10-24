//! Real installation; validated durations and one proven redundant clock redraw vary.
mod startup_frame;
use super::support;
use crate::{
    commands::{
        add::support as paired,
        move_paths::support::{bitmap, setup},
    },
    helper::{config, remote},
};
#[test]
fn remote_single_fork_runs_real_installation_after_native_materialization() {
    let helper = crate::commands::move_paths::support::workspace(1, false);
    config::set_component_env(&helper.scopes.local_path, "comp1", "teambit.harmony/empty-env");
    setup(&helper, "tag --ignore-issues * --message fixture");
    remote::publish(&helper);
    helper.re_init_workspace_with(false);
    helper.add_remote_scope();
    let result = paired::compare_install(
        &helper,
        &format!("fork {}/comp1", helper.scopes.remote),
        durations,
    );
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    assert!(bitmap(&helper).get("comp1").is_some());
    support::assert_origins(&helper, &["comp1"]);
}
fn durations(text: &str) -> String {
    startup_frame::project(text)
        .split_inclusive('\n')
        .map(completion)
        .collect()
}
fn completion(line: &str) -> String {
    let body = line.trim_end_matches(['\r', '\n']);
    let plain = body.strip_prefix("\u{1b}[K\u{1b}[0J").unwrap_or(body);
    let Some((action, duration)) = plain.split_once(" (completed in ") else { return line.into() };
    let recognized = [
        "linking components",
        "done running package installation using pnpm",
        "compiling components",
    ]
    .iter()
    .any(|action_name| {
        action == format!("✔ {action_name}") || action == format!("✓ {action_name}")
    });
    if !recognized {
        return line.into();
    }
    let duration = duration.strip_suffix(')').expect("completion suffix");
    let digits = duration
        .bytes()
        .take_while(|byte| byte.is_ascii_digit() || *byte == b'.')
        .count();
    let number = &duration[..digits];
    assert!(!number.is_empty() && !number.starts_with('.') && !number.ends_with('.'));
    assert!(
        number
            .bytes()
            .filter(|byte| *byte == b'.')
            .count()
            <= 1,
    );
    assert!(["ns", "μs", "µs", "ms", "s", "m", "h"].contains(&&duration[digits..]));
    let start = body.len() - duration.len() - 1;
    format!("{}<duration>){}", &body[..start], &line[body.len()..])
}

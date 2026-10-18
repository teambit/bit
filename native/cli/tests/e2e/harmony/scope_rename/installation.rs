mod startup_progress;

use crate::{
    commands::{add::support as paired, move_paths::support},
    helper::config,
};
use std::fs;
#[test]
fn ordinary_scope_rename_runs_real_installation_and_then_compilation() {
    let helper = support::workspace(1, false);
    config::set_component_env(&helper.scopes.local_path, "comp1", "teambit.harmony/empty-env");
    let old = helper.scopes.remote.clone();
    let result = paired::compare_install(
        &helper,
        &format!("scope rename {old} replacement.scope --preserve"),
        durations,
    );
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    assert!(
        fs::metadata(helper.scopes.local_path.join(
            "node_modules/@replacement/scope.comp1/package.json"
        ))
        .is_ok(),
    );
}
fn durations(text: &str) -> String {
    let durations = text
        .split_inclusive('\n')
        .map(completion)
        .collect::<String>();
    startup_progress::project(&durations)
}
fn completion(line: &str) -> String {
    let (body, newline) = if let Some(body) = line.strip_suffix("\r\n") {
        (body, "\r\n")
    } else {
        line.strip_suffix('\n')
            .map_or((line, ""), |body| (body, "\n"))
    };
    let plain = body.strip_prefix("\u{1b}[K\u{1b}[0J").unwrap_or(body);
    let Some(duration) = completion_duration(plain) else { return line.to_owned() };
    let duration = duration.strip_suffix(')').expect("canonical completion suffix");
    validate_duration(duration);
    let start = body.len() - duration.len() - 1;
    format!("{}<duration>){newline}", &body[..start])
}
fn completion_duration(body: &str) -> Option<&str> {
    for symbol in ["✔", "✓"] {
        for action in [
            "linking components",
            "done running package installation using pnpm",
            "compiling components",
        ] {
            let prefix = format!("{symbol} {action} (completed in ");
            if let Some(duration) = body.strip_prefix(&prefix) {
                return Some(duration);
            }
        }
    }
    None
}
fn validate_duration(duration: &str) {
    let numeric = duration
        .bytes()
        .take_while(|byte| byte.is_ascii_digit() || *byte == b'.')
        .count();
    let value = &duration[..numeric];
    assert!(
        !value.is_empty()
            && !value.starts_with('.')
            && !value.ends_with('.')
            && value
                .bytes()
                .filter(|byte| *byte == b'.')
                .count()
                <= 1,
        "invalid completion number: {duration}",
    );
    assert!(
        ["ns", "μs", "µs", "ms", "s", "m", "h"].contains(&&duration[numeric..]),
        "invalid completion unit: {duration}",
    );
}

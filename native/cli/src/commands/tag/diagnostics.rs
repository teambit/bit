//! Diagnostic fallbacks when `plan_tag` declines on an invalid workspace state,
//! existing exact version, auto-tagged dependent issue, or excluded new dependency.

use super::options::{Mode, Options};
use crate::commands::{
    color::Chalk,
    engine::Engine,
    status::{
        capture,
        issues::{self, Component},
        js::{array, text, without_version},
        report::issue_output,
    },
    workspace_command::{self, resolve},
};
use serde_json::{Value, json};
use std::{collections::HashSet, ffi::OsString, fs, io, path::Path};

/// Inspect a `plan_tag` error and produce a user-facing command error when the
/// decline is caused by a known validation failure.
pub(super) fn diagnose(
    root: &Path,
    args: &[OsString],
    options: &Options,
    policy: &resolve::policy::Policy,
    error: &io::Error,
) -> io::Result<Option<io::Error>> {
    let message = error.to_string();
    let chalk = Chalk::detect(args);
    if (message.contains("status component path")
        || message.contains("status main file not captured"))
        && let Some(err) = main_file_removed(root, chalk)?
    {
        return Ok(Some(err));
    }
    if message.contains("snapshot invalid or existing exact version") {
        let mut engine = Engine::new()?;
        let context: Value = engine.request(&json!({
            "kind": "statusContext",
            "root": root,
            "home": workspace_command::home(),
        }))?;
        if let Some(err) = existing_version_error(&context, options) {
            return Ok(Some(err));
        }
    }
    if message.contains("command missing dependency package name")
        || message.contains("command dependency version")
    {
        return dependency_or_issue_error(root, options, policy, chalk);
    }
    Ok(None)
}

fn main_file_removed(root: &Path, chalk: Chalk) -> io::Result<Option<io::Error>> {
    let raw = fs::read(root.join(".bitmap"))?;
    let Ok(bitmap) = bit_object_import::parse_jsonc(&raw) else {
        return Ok(None);
    };
    let Some(entries) = bitmap.as_object() else {
        return Ok(None);
    };
    let default_scope = workspace_default_scope(root);
    for (key, value) in entries {
        if !entry_missing_main(root, &bitmap, key, value)? {
            continue;
        }
        return Ok(Some(format_main_removed(key, value, default_scope.as_deref(), chalk)));
    }
    Ok(None)
}

fn entry_missing_main(root: &Path, bitmap: &Value, key: &str, value: &Value) -> io::Result<bool> {
    if key.starts_with('$')
        || matches!(key, "_bit_lane" | "version")
        || !value.is_object()
        || value["isAvailableOnCurrentLane"] == false
        || crate::commands::update_cmd::aspect_entry(&value["config"], "teambit.component/remove")
            .is_some_and(|(_, rem)| rem["removed"] == true)
    {
        return Ok(false);
    }
    let Some(root_dir) = value["rootDir"]
        .as_str()
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
    else {
        return Ok(false);
    };
    let main_file = value["mainFile"].as_str().map_or("", str::trim);
    let main_missing = main_file.is_empty()
        || !root
            .join(root_dir)
            .join(main_file)
            .is_file();
    if !main_missing {
        return Ok(false);
    }
    bit_object_import::component_remove::has_scanned_files(root, root_dir, bitmap)
}

fn format_main_removed(
    key: &str,
    value: &Value,
    default_scope: Option<&str>,
    chalk: Chalk,
) -> io::Error {
    let main_file = value["mainFile"].as_str().unwrap_or_default();
    let name = crate::commands::update_cmd::bitmap_row_name(key, value);
    let scope = value["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty());
    let row_default_scope = value["defaultScope"]
        .as_str()
        .filter(|scope| !scope.is_empty());
    let identity = match scope.or(row_default_scope).or(default_scope) {
        Some(scope) => format!("{scope}/{name}"),
        None => name.to_owned(),
    };
    let version = value["version"]
        .as_str()
        .filter(|version| !version.is_empty())
        .or_else(|| {
            key.rsplit_once('@')
                .map(|(_, ver)| ver)
                .filter(|ver| !ver.is_empty())
        });
    let id = match (scope.is_some(), version) {
        (true, Some(version)) => format!("{identity}@{version}"),
        (false, Some(version)) => format!("{name}@{version}"),
        _ => identity,
    };
    let main_display =
        if cfg!(windows) { main_file.replace('/', r"\") } else { main_file.to_owned() };
    io::Error::other(format!(
        "error: main file {} was removed from {}.\nplease use \"bit remove\" to delete the component or \"bit add\" with \"--main\" and \"--id\" flags to add a new mainFile",
        chalk.bold(&main_display),
        chalk.bold(&id),
    ))
}

fn workspace_default_scope(root: &Path) -> Option<String> {
    let raw = fs::read(root.join("workspace.jsonc")).ok()?;
    let config = bit_object_import::parse_jsonc(&raw).ok()?;
    crate::commands::aspect::workspace_default_scope(&config).ok()
}

fn existing_version_error(context: &Value, options: &Options) -> Option<io::Error> {
    let targets = context["targets"].as_array()?;
    let models = context["models"].as_array()?;
    for target in targets {
        let identity = target["identity"]
            .as_str()
            .map(str::trim)
            .filter(|id| !id.is_empty())?;
        let name = target["name"]
            .as_str()
            .map(str::trim)
            .filter(|n| !n.is_empty())
            .unwrap_or(identity);
        if !matches_patterns(identity, name, &options.selection.patterns) {
            continue;
        }
        let exact = requested_exact_version(target, identity, name, options)?;
        let model = models
            .iter()
            .find(|model| {
                format!(
                    "{}/{}",
                    model["scope"].as_str().map_or("", str::trim),
                    model["name"].as_str().map_or("", str::trim),
                ) == identity
            })?;
        if model["versions"].get(exact).is_some() || model["orphanedVersions"].get(exact).is_some()
        {
            return Some(io::Error::other(format!(
                "error: version {exact} already exists for {identity}",
            )));
        }
    }
    None
}

fn requested_exact_version<'a>(
    target: &'a Value,
    identity: &str,
    name: &str,
    options: &'a Options,
) -> Option<&'a str> {
    if options.mode == Mode::Persist {
        return target["nextVersion"]["version"]
            .as_str()
            .map(str::trim)
            .filter(|ver| !ver.is_empty());
    }
    for pattern in &options.selection.patterns {
        if let Some((base, ver)) = pattern.rsplit_once('@')
            && !base.is_empty()
            && !ver.trim().is_empty()
            && matches_single_pattern(identity, name, base)
        {
            return Some(ver.trim());
        }
    }
    options.release.exact_version.as_deref()
}

fn matches_patterns(identity: &str, name: &str, patterns: &[String]) -> bool {
    if patterns.is_empty() {
        return true;
    }
    patterns
        .iter()
        .any(|pattern| {
            let base = pattern.rsplit_once('@').map_or(pattern.as_str(), |(base, _)| base);
            matches_single_pattern(identity, name, base)
        })
}

fn matches_single_pattern(identity: &str, name: &str, pattern: &str) -> bool {
    let trimmed = pattern.trim();
    trimmed == "*"
        || trimmed == "**"
        || trimmed == identity
        || trimmed == name
        || identity.ends_with(&format!("/{trimmed}"))
}

fn dependency_or_issue_error(
    root: &Path,
    options: &Options,
    policy: &resolve::policy::Policy,
    chalk: Chalk,
) -> io::Result<Option<io::Error>> {
    let home = workspace_command::home();
    let mut engine = Engine::new()?;
    let context: Value = engine.request(&json!({
        "kind": "statusContext",
        "root": root,
        "home": &home,
    }))?;
    let targets = array(context.get("targets"), "targets")?;
    let captured = capture::capture_with(
        &mut engine,
        root,
        &home,
        &context,
        targets,
        capture::CaptureOptions { allow_special_states: true, verify: true, ..Default::default() },
    )?;
    let selected = selected_identities(targets, &options.selection.patterns);
    let candidates = if options.skip_auto_tag {
        selected.clone()
    } else {
        with_auto_tag_dependents(&selected, targets, &captured.components)
    };
    let mut req = json!({});
    policy.apply(&mut req);
    let ignore_str = req["ignoreIssues"].as_str().unwrap_or_default();
    if ignore_str != "*"
        && let Some(rows) = issues::collect(root, &context, &captured.components)?
        && let Some(err) = format_blockers(&rows, &candidates, ignore_str, chalk)?
    {
        return Ok(Some(err));
    }
    Ok(untagged_dependency_error(targets, &captured.components, &selected, options))
}

fn selected_identities(targets: &[Value], patterns: &[String]) -> Vec<String> {
    targets
        .iter()
        .filter_map(|target| {
            let identity = target["identity"].as_str()?;
            let name = target["name"].as_str().unwrap_or(identity);
            matches_patterns(identity, name, patterns).then(|| identity.to_owned())
        })
        .collect()
}

fn with_auto_tag_dependents(
    selected: &[String],
    targets: &[Value],
    components: &[Component],
) -> Vec<String> {
    let mut result = selected.to_vec();
    let mut changed = true;
    while changed {
        changed = false;
        for component in components {
            let id = without_version(&component.identity).to_owned();
            if !result.contains(&id)
                && is_versioned_target(targets, &id)
                && depends_on_any(component, &result)
            {
                result.push(id);
                changed = true;
            }
        }
    }
    result
}

fn depends_on_any(component: &Component, selected: &[String]) -> bool {
    component.dependencies
        .iter()
        .any(|dep| {
            selected
                .iter()
                .any(|sel| sel == without_version(dep))
        })
}

fn is_versioned_target(targets: &[Value], identity: &str) -> bool {
    targets
        .iter()
        .any(|target| {
            target["identity"].as_str() == Some(identity)
                && (!target["version"]
                    .as_str()
                    .unwrap_or_default()
                    .is_empty()
                    || target["scoped"] == true)
        })
}

fn format_blockers(
    rows: &[Value],
    candidates: &[String],
    ignore_str: &str,
    chalk: Chalk,
) -> io::Result<Option<io::Error>> {
    let ignored: HashSet<&str> = ignore_str
        .split(',')
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .collect();
    let mut formatted = Vec::new();
    for row in rows {
        let id = text(row.get("id"))?;
        if !candidates
            .iter()
            .any(|candidate| candidate == id)
        {
            continue;
        }
        let blockers: Vec<Value> = array(row.get("issues"), "component issues")?
            .iter()
            .filter(|issue| {
                issue["isTagBlocker"] == true
                    && !ignored.contains(issue["type"].as_str().unwrap_or_default())
            })
            .cloned()
            .collect();
        if !blockers.is_empty() {
            formatted.push(format!(
                "{}\n       {}\n",
                chalk.underline(&chalk.cyan(id)),
                issue_output(&blockers, chalk),
            ));
        }
    }
    if formatted.is_empty() {
        return Ok(None);
    }
    Ok(Some(io::Error::other(format!(
        "error: issues found with the following components\n\n{}\n\nto get the list of component-issues names and suggestions how to resolve them, run \"bit component-issues\".\n",
        formatted.join("\n"),
    ))))
}

fn untagged_dependency_error(
    targets: &[Value],
    components: &[Component],
    selected: &[String],
    options: &Options,
) -> Option<io::Error> {
    for comp_id in selected {
        let component = components
            .iter()
            .find(|comp| without_version(&comp.identity) == comp_id)?;
        for dep in &component.dependencies {
            let dep_id = without_version(dep);
            if selected.iter().any(|sel| sel == dep_id) {
                continue;
            }
            if !is_versioned_target(targets, dep_id) {
                let ver = options.release.exact_version.as_deref().unwrap_or("0.0.1");
                return Some(io::Error::other(format!(
                    "fatal: \"{comp_id}@{ver}\" has a dependency \"{dep_id}\".\nthis dependency was not included in the tag command.",
                )));
            }
        }
    }
    None
}

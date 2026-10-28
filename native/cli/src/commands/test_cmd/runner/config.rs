use super::{Value, files, invalid, json, settings::Settings};
use crate::commands::workspace_command::component_service::Component;
use bit_install::{
    config::WorkspaceConfig,
    dependencies::{DevPatternConfig, EnvDevPatterns, dev_files, dev_patterns},
    workspace::Workspace,
};
use std::{fs, io, path::Path};

pub(super) fn request(
    root: &Path,
    selected: &Component,
    environment: &str,
    settings: &Settings,
) -> io::Result<Option<Value>> {
    let patterns = patterns(root, selected)?;
    let tests = files::tests(selected, &patterns.tests)?;
    if settings.files
        .iter()
        .any(|file| !tests.contains(file))
    {
        return Err(invalid("tester requested file recognition"));
    }
    if tests.is_empty() {
        return Ok(None);
    }
    let mut config: Value = serde_json::from_str(include_str!("config.json"))?;
    config["rootDir"] = json!(root);
    config["roots"] = json!([root]);
    config["testMatch"] = if settings.files.is_empty() {
        json!(
            patterns.tests
                .iter()
                .map(|pattern| absolute_pattern(&root.join(&selected.directory), pattern))
                .collect::<Vec<_>>()
        )
    } else {
        json!(
            tests
                .iter()
                .filter(|file| settings.files.contains(file))
                .collect::<Vec<_>>()
        )
    };
    if environment == "teambit.react/react" {
        config["testEnvironment"] = json!("$jsdom");
        config["setupFiles"] = json!(["$polyfill"]);
    }
    let options = tool_options(&mut config, patterns.dev_files, settings);
    Ok(Some(json!({"root":root,"config":config,"options":options})))
}
fn tool_options(config: &mut Value, dev_files: Vec<String>, settings: &Settings) -> Value {
    let mut options = json!({});
    if settings.update_snapshot {
        options["updateSnapshot"] = json!(true);
    }
    if settings.coverage {
        options["coverage"] = json!(true);
        options["collectCoverage"] = json!(true);
        options["coverageReporters"] = json!(["text", "json-summary"]);
        let mut ignored = vec!["/node_modules/".to_owned()];
        ignored.extend(dev_files);
        ignored.push("/^.*/.*.bit-app..*$/".to_owned());
        config["coveragePathIgnorePatterns"] = json!(ignored);
    }
    options
}

struct Patterns {
    tests: Vec<String>,
    dev_files: Vec<String>,
}
fn patterns(root: &Path, selected: &Component) -> io::Result<Patterns> {
    let raw: Value = bit_object_import::parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    let config = WorkspaceConfig::load(root).map_err(io::Error::other)?;
    let core: Vec<String> = serde_json::from_str(include_str!(
        "../../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
    ))?;
    let workspace = Workspace::load(root, &config, &core).map_err(io::Error::other)?;
    let (_, component) = workspace
        .active()
        .find(|(entry, _)| entry.root_dir == selected.directory)
        .ok_or_else(|| invalid("tester component patterns"))?;
    let configured = DevPatternConfig::from_aspects(&|id| raw.get(id).cloned());
    let mut patterns = dev_patterns(component, &configured, &EnvDevPatterns::default());
    let dev_files = dev_files(component, &patterns);
    Ok(Patterns {
        tests: patterns.shift_remove("teambit.defender/tester").unwrap_or_default(),
        dev_files,
    })
}

fn absolute_pattern(directory: &Path, pattern: &str) -> String {
    let (prefix, relative) = pattern
        .strip_prefix('!')
        .map_or(("", pattern), |value| ("!", value));
    format!("{prefix}{}", directory.join(relative).display())
}

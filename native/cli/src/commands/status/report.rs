//! `bit status` without `--json`: `StatusCmd.report` and `formatStatusOutput`.

pub(in crate::commands) use item::issue_output;

mod item;
mod lane_updates;
mod render;
#[cfg(test)]
mod report_tests;
mod sections;

use super::js::{array, decline, text};
use crate::commands::{color::Chalk, workspace_command::format::Formatter};
use serde_json::Value;
use std::{collections::HashMap, io};

const FAILURE: &str = "issues found";
const WARNINGS: &str = "warnings found";
const CLEAN: &str = r#"nothing to tag or export (use "bit create <template> <component>" to generate a new component)"#;
const IMPORT_PENDING: &str = r#"your workspace has outdated objects. please use "bit import" to pull the latest objects from the remote scope."#;
const TROUBLESHOOTING: &str =
    "learn more about Bit components: https://bit.dev/reference/components/component-anatomy";
const TITLE_ONLY: [&str; 5] = [
    "MissingDists",
    "MissingLinksFromNodeModulesToSrc",
    "CircularDependencies",
    "LegacyInsideHarmony",
    "MergeConfigHasConflict",
];
const AUTO_TAG: &str = "(these will be auto-tagged when their modified dependencies are tagged)";

#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct Flags {
    pub lanes: bool,
    pub verbose: bool,
    pub warnings: bool,
    pub strict: bool,
    pub fail_on_error: bool,
    pub expand: bool,
    pub ignore_circular: bool,
}

pub(super) fn parse(args: &[&str]) -> Option<Flags> {
    let mut flags = Flags::default();
    let mut seen: Vec<&str> = Vec::new();
    for (idx, &arg) in args.iter().enumerate() {
        if arg == "--" {
            return (idx + 1 == args.len()).then_some(flags);
        }
        if !matches!(
            arg,
            "--no-color"
                | "--no-color=true"
                | "--no-color=false"
                | "--color"
                | "--color=true"
                | "--color=false"
                | "--color=always"
                | "--color=never",
        ) {
            apply_report_flag(&mut flags, &mut seen, arg)?;
        }
    }
    Some(flags)
}

fn apply_report_flag<'a>(flags: &mut Flags, seen: &mut Vec<&'a str>, arg: &'a str) -> Option<()> {
    let (raw_flag, val) = match arg.split_once('=') {
        Some((key, "true")) if key.starts_with("--") => (key, true),
        Some((key, "false")) if key.starts_with("--") => (key, false),
        None => (arg, true),
        _ => return None,
    };
    let flag = match raw_flag {
        "-w" => "--warnings",
        "-l" => "--lanes",
        "-c" => "--ignore-circular-dependencies",
        _ => raw_flag,
    };
    if seen.contains(&flag) {
        return None;
    }
    seen.push(flag);
    let field = match flag {
        "--lanes" => &mut flags.lanes,
        "--verbose" => &mut flags.verbose,
        "--warnings" => &mut flags.warnings,
        "--strict" => &mut flags.strict,
        "--fail-on-error" => &mut flags.fail_on_error,
        "--expand" => &mut flags.expand,
        "--ignore-circular-dependencies" => &mut flags.ignore_circular,
        _ => return None,
    };
    *field = val;
    Some(())
}

pub(super) struct Output {
    pub data: String,
    pub code: i32,
}

struct WithIssues<'r> {
    identity: &'r str,
    version: Option<&'r str>,
    issues: &'r [Value],
}

impl WithIssues<'_> {
    fn tag_blocker(&self) -> bool {
        self.issues
            .iter()
            .any(|issue| issue["isTagBlocker"] == true)
    }
}

struct Status<'r> {
    result: &'r Value,
    format: Formatter,
    flags: &'r Flags,
    with_issues: Vec<WithIssues<'r>>,
    soft_tagged: Vec<&'r str>,
    models: ModelFacts<'r>,
    troubleshooting: std::cell::Cell<bool>,
}

struct ModelFacts<'r> {
    versions: HashMap<&'r str, Option<&'r str>>,
    heads: HashMap<String, &'r str>,
    histories: &'r [Value],
}

pub(super) fn report(
    result: &Value,
    context: &Value,
    flags: &Flags,
    chalk: Chalk,
) -> io::Result<Output> {
    lane_supported(result)?;
    let status = Status::new(result, context, flags, chalk)?;
    let sections = status.sections()?;
    let warnings = if status.printed_issues() < status.with_issues.len() {
        status.format.chalk.yellow("to view the warnings, use --warnings flag.")
    } else {
        String::new()
    };
    let troubleshooting = if status.troubleshooting.get() {
        status.format.chalk.yellow(TROUBLESHOOTING)
    } else {
        String::new()
    };
    let workspace_issues = status.workspace_issues()?;
    let mut data = render_data(&status, &sections, &warnings, &troubleshooting, &workspace_issues)?;
    if let Some(lane) = status.lane()? {
        data.push_str("\n\ncurrent lane ");
        data.push_str(&status.format.chalk.bold(lane));
    }
    if !ids(result, "importPendingComponents")?.is_empty() {
        data = format!("{IMPORT_PENDING}\n{data}");
    }
    Ok(Output { data, code: status.code() })
}

pub(super) fn color_issue_data(result: &mut Value, chalk: Chalk) {
    for component in result["componentsWithIssues"]
        .as_array_mut()
        .into_iter()
        .flatten()
    {
        for issue in component["issues"]
            .as_array_mut()
            .into_iter()
            .flatten()
        {
            if let Some(object) = issue.as_object_mut() {
                object.remove("__callbackCLI");
            }
            if issue["type"] == "UntrackedDependencies" {
                issue["dataAsString"] = Value::String(item::issue_data(issue, chalk));
            }
        }
    }
}

fn render_data(
    status: &Status<'_>,
    sections: &[String],
    warnings: &str,
    troubleshooting: &str,
    workspace_issues: &str,
) -> io::Result<String> {
    let auto_tag = ids(status.result, "autoTagPendingComponents")?;
    let update_dependents = ids(status.result, "pendingUpdateDependents")?;
    if auto_tag.is_empty() && update_dependents.is_empty() {
        return Ok(status.joined(sections, warnings, troubleshooting, workspace_issues));
    }
    let auto_summary = status.collapsed(&auto_tag, "components pending auto-tag", AUTO_TAG)?;
    let dependent_summary = status.collapsed(
        &update_dependents,
        "pending update-dependents",
        "(impacted dependents that will be pushed on next export — from local cascade or 'Snap updates')",
    )?;
    Ok(status.rendered(
        sections,
        &auto_summary,
        &dependent_summary,
        [warnings, troubleshooting],
        workspace_issues,
    ))
}

fn lane_supported(result: &Value) -> io::Result<()> {
    let valid_scoped = |value: &str| {
        value
            .trim()
            .split_once('/')
            .is_some_and(|(scope, name)| !scope.trim().is_empty() && !name.trim().is_empty())
    };
    let lane = text(result.get("currentLaneId"))?;
    let forked_invalid = result
        .get("forkedLaneId")
        .is_some_and(|id| {
            !id.is_null()
                && id
                    .as_str()
                    .is_none_or(|val| !valid_scoped(val))
        });
    if !valid_scoped(lane) || forked_invalid {
        return Err(decline("status report lane"));
    }
    Ok(())
}

fn ids<'r>(result: &'r Value, field: &str) -> io::Result<Vec<&'r str>> {
    array(result.get(field), field)?
        .iter()
        .map(|id| text(Some(id)).map(str::trim))
        .collect()
}

fn model_heads<'r>(
    context: &'r Value,
    versions: &HashMap<&'r str, Option<&'r str>>,
) -> io::Result<HashMap<String, &'r str>> {
    let mut heads = HashMap::new();
    for model in array(context.get("models"), "models")? {
        if let (Some(scope), Some(name), Some(head)) = (
            model["scope"]
                .as_str()
                .filter(|scope| !scope.is_empty()),
            model["name"].as_str(),
            model["head"].as_str(),
        ) {
            heads.insert(format!("{scope}/{name}"), head);
        }
    }
    for &identity in versions.keys() {
        if let Some(head) =
            super::policy::model_of(context, identity).and_then(|model| model["head"].as_str())
        {
            heads.entry(identity.to_owned()).or_insert(head);
        }
    }
    Ok(heads)
}

impl<'r> Status<'r> {
    fn lane(&self) -> io::Result<Option<&'r str>> {
        let lane = text(self.result.get("currentLaneId"))?;
        Ok((!lane.ends_with("/main")).then_some(lane))
    }

    fn new(
        result: &'r Value,
        context: &'r Value,
        flags: &'r Flags,
        chalk: Chalk,
    ) -> io::Result<Self> {
        let mut versions = HashMap::new();
        for target in array(context.get("targets"), "targets")? {
            let version = text(target.get("version"))?;
            versions.insert(
                text(target.get("identity"))?,
                Some(version).filter(|version| !version.is_empty()),
            );
        }
        let heads = model_heads(context, &versions)?;
        let mut status = Self {
            result,
            format: Formatter::new(chalk),
            flags,
            with_issues: Vec::new(),
            soft_tagged: ids(result, "softTaggedComponents")?,
            models: ModelFacts {
                versions,
                heads,
                histories: array(context.get("histories"), "histories")?,
            },
            troubleshooting: std::cell::Cell::new(false),
        };
        for row in array(result.get("componentsWithIssues"), "issues")? {
            let identity = text(row.get("id"))?;
            let version = status.version(identity)?;
            let issues = array(row.get("issues"), "issues")?;
            status.with_issues.push(WithIssues { identity, version, issues });
        }
        Ok(status)
    }

    fn version(&self, identity: &str) -> io::Result<Option<&'r str>> {
        self.models.versions
            .get(identity)
            .copied()
            .ok_or_else(|| decline("status report target"))
    }

    fn issues_of(&self, identity: &str, version: Option<&str>) -> Option<&WithIssues<'r>> {
        self.with_issues
            .iter()
            .find(|row| row.identity == identity && row.version == version)
    }

    fn printed_issues(&self) -> usize {
        self.with_issues
            .iter()
            .filter(|row| row.tag_blocker() || self.flags.warnings)
            .count()
    }

    fn code(&self) -> i32 {
        let blockers = self.with_issues.iter().any(WithIssues::tag_blocker);
        i32::from(
            (self.flags.strict && !self.with_issues.is_empty())
                || (!self.flags.strict && self.flags.fail_on_error && blockers),
        )
    }
}

//! The import and fetch reports: the engine's receipt, validated, then
//! `ImportCmd.report` and `FetchCmd.report` of `@teambit/importer` over the
//! engine's receipt ([`Details`], [`Receipt`], [`parse`], [`import_report`], [`fetch_report`]) via [`Id`], [`Formatter`], and [`Chalk`].

#[cfg(test)]
mod report_tests;

use crate::commands::{
    color::Chalk,
    ids::Id,
    status::js::{array, decline, object, text},
    workspace_command::format::Formatter,
};
use serde_json::Value;
use std::{collections::HashSet, io};

/// One component's `importDetails` entry from the validated engine [`Receipt`].
pub struct Details {
    id: String,
    versions: Vec<String>,
    latest: Option<String>,
    status: String,
    deprecated: bool,
    removed: bool,
    conflicts: Vec<String>,
}

/// The engine's receipt, validated: the imported ids and their details.
pub struct Receipt {
    pub ids: Vec<String>,
    details: Vec<Details>,
    on_lane: bool,
    workspace_policy: Option<Value>,
}

/// Validates the engine's inbound JSON receipt `value` into a structured [`Receipt`].
pub fn validate(value: &Value) -> io::Result<Receipt> {
    let rows = array(value.get("importedIds"), "imported ids")?;
    let details = array(value.get("importDetails"), "import details")?;
    let owned = value.get("owner").and_then(Value::as_str) == Some("rust");
    let token = value
        .get("token")
        .and_then(Value::as_str)
        .is_some_and(|token| !token.is_empty());
    if !owned
        || !token
        || rows.len() > 4096
        || !value["progress"].is_array()
        || details.len() != rows.len()
    {
        return Err(decline("native inbound receipt"));
    }
    let multi_lane = value["laneFetch"] == true && value["laneGroups"].is_array();
    let repeated_versions =
        multi_lane || value["laneObjectImport"] == true && value["currentLane"].is_string();
    let (ids, imported) = imported_ids(rows, repeated_versions)?;
    let mut seen = HashSet::with_capacity(details.len());
    let details = details
        .iter()
        .map(|row| {
            let detail = details_row(row)?;
            if !imported.contains(&detail.id)
                || (!seen.insert(detail.id.clone()) && !repeated_versions)
            {
                return Err(decline("native inbound details"));
            }
            Ok(detail)
        })
        .collect::<io::Result<_>>()?;
    Ok(Receipt {
        ids,
        details,
        on_lane: value.get("currentLane").is_some_and(Value::is_string),
        workspace_policy: value.get("workspaceConfigUpdateResult").cloned(),
    })
}

/// Versioned ids, distinct without their versions.
fn imported_ids(rows: &[Value], multi_lane: bool) -> io::Result<(Vec<String>, HashSet<String>)> {
    let mut imported = HashSet::with_capacity(rows.len());
    let mut ids = Vec::with_capacity(rows.len());
    for row in rows {
        let text = text(Some(row))?;
        let id = Id::parse(text)?;
        if text.len() > 4096
            || !text.contains('@')
            || !id.has_version()
            || (!imported.insert(id.without_version()) && !multi_lane)
        {
            return Err(decline("native inbound identity"));
        }
        ids.push(text.to_string());
    }
    Ok((ids, imported))
}
/// Deserializes and validates a single `importDetails` entry `row` into [`Details`].
fn details_row(row: &Value) -> io::Result<Details> {
    let map = object(row)?;
    let versions: Vec<String> = array(map.get("versions"), "versions")?
        .iter()
        .map(|version| text(Some(version)).map(|ver| ver.trim().to_string()))
        .collect::<io::Result<_>>()?;
    let status = text(map.get("status"))?.trim();
    let latest = map.get("latestVersion").unwrap_or(&Value::Null);
    let removed = map.get("removed");
    let conflicts = conflict_paths(map.get("filesStatus"))?;
    let valid = matches!(status, "added" | "updated" | "up to date")
        && versions.len() <= 4096
        && versions
            .iter()
            .all(|version| !version.is_empty() && version.len() <= 256)
        && (latest.is_null() || latest.is_string())
        && map
            .get("filesStatus")
            .and_then(Value::as_object)
            .is_none_or(|files| files.len() == conflicts.len())
        && map
            .get("missingDeps")
            .and_then(Value::as_array)
            .is_some_and(Vec::is_empty)
        && map.get("deprecated").is_some_and(Value::is_boolean)
        && removed.is_none_or(Value::is_boolean);
    if !valid {
        return Err(decline("native inbound details"));
    }
    Ok(Details {
        id: text(map.get("id"))?.trim().to_string(),
        versions,
        latest: parse_latest_version(latest),
        status: status.to_string(),
        deprecated: map.get("deprecated") == Some(&Value::Bool(true)),
        removed: removed == Some(&Value::Bool(true)),
        conflicts,
    })
}

#[inline]
fn parse_latest_version(latest: &Value) -> Option<String> {
    latest
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .map(str::to_string)
}

#[inline]
fn conflict_paths(value: Option<&Value>) -> io::Result<Vec<String>> {
    match value {
        Some(Value::Null) => Ok(Vec::new()),
        Some(Value::Object(files)) if files.len() <= 4096 => Ok(files
            .iter()
            .filter_map(|(path, status)| {
                let trimmed = path.trim();
                (status == "manual" && !trimmed.is_empty() && trimmed.len() <= 4096).then(|| {
                    trimmed.to_owned()
                })
            })
            .collect()),
        _ => Err(decline("native inbound details")),
    }
}

impl Receipt {
    #[inline]
    fn details(&self, id: &Id) -> io::Result<&Details> {
        let name = id.without_version();
        self.details
            .iter()
            .find(|detail| detail.id.trim() == name)
            .ok_or_else(|| decline("missing details"))
    }

    /// `ImportCmd.report`; `installation_error` is the message the
    /// installation after the write failed with.
    #[inline]
    pub fn import_report(
        &self,
        chalk: Chalk,
        installation_error: Option<&str>,
    ) -> io::Result<String> {
        self.import_report_with_errors(chalk, installation_error, None)
    }

    pub fn import_report_with_errors(
        &self,
        chalk: Chalk,
        installation_error: Option<&str>,
        compilation_error: Option<&str>,
    ) -> io::Result<String> {
        if self.ids.is_empty() {
            return Ok(chalk.yellow("nothing to import"));
        }
        let format = Formatter::new(chalk);
        let (items, up_to_date) = self.import_items(&format)?;
        let prefix = match unique_components(&self.ids) {
            1 => "successfully imported one component".to_string(),
            count => format!("successfully imported {count} components"),
        };
        let suffix = if self.on_lane { " on the lane" } else { "" };
        let up_to_date = if up_to_date == 0 {
            String::new()
        } else {
            format!(", {up_to_date} components are up to date{suffix}")
        };
        let imported = format.section("imported components", "", &items);
        let summary = format.success_summary(&format!("{prefix}{up_to_date}"));
        let installation = installation_error_output(&format, installation_error);
        let compilation = compilation_error_output(&format, compilation_error);
        let (logs, policy) = crate::commands::checkout::report::policy::format(
            self.workspace_policy.as_ref(),
            chalk,
        )?;
        Ok(Formatter::join(&[
            logs,
            imported,
            self.removed(&format),
            policy,
            installation,
            compilation,
            summary,
        ]))
    }

    fn import_items(&self, format: &Formatter) -> io::Result<(Vec<String>, usize)> {
        let mut items = Vec::with_capacity(self.ids.len());
        let mut up_to_date = 0;
        for id in &self.ids {
            let id = Id::parse(id)?;
            let details = self.details(&id)?;
            up_to_date += usize::from(details.status == "up to date");
            items.extend(import_item(format, &id, details));
        }
        Ok((items, up_to_date))
    }

    /// `getRemovedWarning`.
    fn removed(&self, format: &Formatter) -> String {
        let items: Vec<String> = self.details
            .iter()
            .filter(|details| details.removed)
            .map(|details| {
                Formatter::item_with(&format.chalk.bold(&details.id), &format.error_symbol())
            })
            .collect();
        if items.is_empty() {
            return String::new();
        }
        let description = "imported component(s) are marked as deleted and may not be up to date";
        let section = format.section("deleted components", description, &items);
        Formatter::join(&[section, format.hint(r#"run "bit recover <component-id>" to restore"#)])
    }

    /// `FetchCmd.report`.
    pub fn fetch_report(&self, chalk: Chalk) -> io::Result<String> {
        let format = Formatter::new(chalk);
        if self.ids.is_empty() {
            return Ok(format.hint("nothing to import"));
        }
        let mut lines = Vec::with_capacity(1 + self.ids.len());
        lines.push(format.success_summary(&format!("fetched {} component(s)", self.ids.len())));
        for id in &self.ids {
            let id = Id::parse(id)?;
            lines.push(fetch_item(chalk, &id, self.details(&id)?));
        }
        Ok(lines.join("\n"))
    }
}

/// `installationErrorOutput`.
#[inline]
fn installation_error_output(format: &Formatter, message: Option<&str>) -> String {
    let Some(message) = message else { return String::new() };
    let title = format!("{} {}", format.error_symbol(), format.title("Installation Error"));
    [
        title.as_str(),
        "The following error was thrown by the package manager:",
        &format.chalk.red(message),
        r#"Use "bit install" to complete the installation, remove the imported components using "bit remove <comp id>" or remove the missing dependencies from their source code"#,
    ]
    .join("\n")
}

#[inline]
fn compilation_error_output(format: &Formatter, message: Option<&str>) -> String {
    let Some(message) = message else { return String::new() };
    [
        format!("{} {}", format.error_symbol(), format.title("Compilation Error")),
        "The following error was thrown by the compiler".to_string(),
        format.chalk.red(message),
        r#"Please fix the issue and run "bit compile""#.to_string(),
    ]
    .join("\n")
}

/// `formatPlainComponentItemWithVersions` of the import command; `None` for
/// an ordinary up-to-date component.
fn import_item(format: &Formatter, id: &Id, details: &Details) -> Option<String> {
    let chalk = format.chalk;
    let deprecated = if details.deprecated && !details.removed {
        chalk.yellow("deprecated")
    } else {
        String::new()
    };
    let removed = if details.removed { chalk.red("deleted") } else { String::new() };
    if details.status == "up to date"
        && deprecated.is_empty()
        && removed.is_empty()
        && details.conflicts.is_empty()
    {
        return None;
    }
    let symbol = if details.removed {
        format.error_symbol()
    } else if details.deprecated {
        format.warn_symbol()
    } else {
        chalk.dim("\u{203A}")
    };
    let parts = [
        chalk.green(&details.status),
        chalk.cyan(&id.without_version()),
        version_output(id, details),
        conflict_output(chalk, details),
        format!("{deprecated}{removed}"),
    ];
    let line = parts
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    Some(Formatter::item_with(&chalk.dim(&line), &symbol))
}

#[inline]
fn conflict_output(chalk: Chalk, details: &Details) -> String {
    if details.conflicts.is_empty() {
        return String::new();
    }
    let names = details.conflicts
        .iter()
        .map(|name| chalk.bold(name))
        .collect::<Vec<_>>()
        .join(", ");
    format!("(the following files were saved with conflicts {names}) ")
}

/// The new versions and the version in use.
fn version_output(id: &Id, details: &Details) -> String {
    let version = id.version.as_deref().unwrap_or("undefined");
    let added = details.status == "added";
    let count = details.versions.len();
    let (versions, latest) = match &details.latest {
        _ if count == 0 => (String::new(), false),
        Some(latest) if latest == version && added => (String::new(), true),
        Some(latest) => (format!("{count} new version(s) available, latest {latest}"), false),
        None if count > 5 => (format!("{count} new versions"), false),
        None => (format!("new versions: {}", details.versions.join(", ")), false),
    };
    let latest = if latest { " (latest)" } else { "" };
    let used =
        if added { format!("currently used version {version}{latest}") } else { String::new() };
    [versions, used]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}

/// `formatPlainComponentItemWithVersions` of the fetch command.
#[inline]
fn fetch_item(chalk: Chalk, id: &Id, details: &Details) -> String {
    let versions = if details.versions.is_empty() {
        String::new()
    } else {
        format!("new versions: {}", details.versions.join(", "))
    };
    let used = if details.status == "added" {
        format!(", currently used version {}", id.version.as_deref().unwrap_or("undefined"))
    } else {
        String::new()
    };
    let deprecated = if details.deprecated { chalk.yellow("deprecated") } else { String::new() };
    format!(
        "- {} {} {versions}{used} {deprecated} ",
        chalk.green(&details.status),
        chalk.cyan(&id.without_version()),
    )
}

#[inline]
fn unique_components(ids: &[String]) -> usize {
    ids.iter()
        .map(|id| {
            let trimmed = id.trim();
            match trimmed.rsplit_once('@') {
                Some((identity, _)) if !identity.trim().is_empty() => identity.trim(),
                _ => trimmed,
            }
        })
        .collect::<HashSet<_>>()
        .len()
}

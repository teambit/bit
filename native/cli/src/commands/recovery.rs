//! Native component and lane merge abort through the workspace recovery plan.
//! All validation and file restoration stay in the Rust workspace engine.

#[cfg(test)]
mod tests;

use super::{
    checkout,
    color::Chalk,
    engine::Engine,
    ids::Id,
    install::confirm,
    installation::{self, Installer},
    status::{
        cache,
        capture::{self, Capture},
        fresh::dependency_grammar,
        grammar,
        js::{array, decline, object, text},
    },
    workspace_command::{self, format::Formatter, progress::Progress, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::output::Output;
use serde_json::{Value, json};
use std::{env, ffi::OsString, io, path::Path};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Component,
    Lane,
}

pub(super) struct Options {
    kind: Kind,
    pattern: Option<String>,
    skip_install: bool,
    verbose: bool,
    silent: bool,
}

pub(super) fn parse_component(args: &[&str]) -> Option<Options> {
    parse(args, Kind::Component)
}

pub(super) fn parse_lane(args: &[&str]) -> Option<Options> {
    parse(args, Kind::Lane)
}

#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::excessive_cognitive_complexity,
        reason = "Existing CLI orchestration is retained until its operation is decomposed"
    )
)]
fn parse(args: &[&str], kind: Kind) -> Option<Options> {
    let mut pattern = None;
    let mut abort = false;
    let mut silent = false;
    let mut skip_install = false;
    let mut verbose = false;
    for arg in args {
        match *arg {
            "--abort" if kind == Kind::Component && !abort => abort = true,
            "-s" | "--silent" if kind == Kind::Lane && !silent => silent = true,
            "-x" | "--skip-dependency-installation" if !skip_install => skip_install = true,
            "--verbose" if !verbose => verbose = true,
            value if kind == Kind::Component && pattern.is_none() && valid_pattern(value) => {
                pattern = Some(value.to_string());
            }
            _ => return None,
        }
    }
    if kind == Kind::Component && !abort {
        return None;
    }
    Some(Options { kind, pattern, skip_install, verbose, silent })
}

fn valid_pattern(pattern: &str) -> bool {
    !pattern.is_empty()
        && pattern.len() <= 256
        && !pattern.starts_with('-')
        && pattern
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"_./-".contains(&byte)
            })
}

#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::excessive_cognitive_complexity,
        reason = "Existing CLI orchestration is retained until its operation is decomposed"
    )
)]
pub(super) fn run(args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    // Component abort calls checkout(reset) without forwarding -x; the Node
    // command installs even when -x was supplied to merge.
    let installer = if options.kind == Kind::Lane && options.skip_install {
        None
    } else {
        match Installer::start(&root, &argv) {
            Ok(installer) => Some(installer),
            Err(error) => {
                return Ok(Outcome::Declined(format!("merge recovery installation: {error}")));
            }
        }
    };
    let prepared = match Prepared::plan(&root, options) {
        Ok(prepared) => prepared,
        Err(error) => return Ok(Outcome::Declined(format!("merge recovery: {error}"))),
    };
    let command = if options.kind == Kind::Lane { "merge-abort" } else { "merge" };
    workspace_command::execute_then(&root, args, command, |output| {
        if options.kind == Kind::Lane && !options.silent {
            output.stop();
            if !confirm(&prepared.prompt(Chalk::detect(args)))? {
                return Err(io::Error::other("operation aborted"));
            }
        }
        execute(&root, args, output, prepared, installer)
    })
}

struct Prepared {
    engine: Engine,
    token: String,
    context: Value,
    capture: Capture,
    progress: Option<Progress>,
    ids: Vec<String>,
    kind: Kind,
    removed_directories: Option<String>,
}

impl Prepared {
    #[cfg_attr(
        dylint_lib = "perfectionist",
        expect(
            perfectionist::overly_long_function,
            perfectionist::too_many_local_bindings,
            reason = "Existing CLI orchestration is retained until its operation is decomposed"
        )
    )]
    fn plan(root: &Path, options: &Options) -> io::Result<Self> {
        let home = workspace_command::home();
        let mut engine = Engine::new()?;
        let operation = if options.kind == Kind::Lane { "laneAbort" } else { "componentAbort" };
        let mut request = json!({
            "kind":"commandRecoveryPrepare","root":root,"home":home,
            "globalRemotesFile":cache::cache_root().join("config/global-remotes.json"),
            "operation":operation,"dependencyGrammar":dependency_grammar()?,
            "options":{"silent":options.kind==Kind::Lane,"verbose":options.verbose,
                "skipDependencyInstallation":true},
        });
        if let Some(pattern) = &options.pattern {
            request["options"]["pattern"] = json!(pattern);
        }
        let prepared: Value = engine.request(&request)?;
        let token = text(prepared.get("token"))?.to_string();
        let context = prepared
            .get("context")
            .filter(|value| value.is_object())
            .ok_or_else(|| decline("recovery context"))?
            .clone();
        let targets = array(prepared.get("captureTargets"), "recovery capture targets")?;
        if targets.len() > 4096 {
            return Err(decline("recovery target limit"));
        }
        let capture = capture::capture_with(
            &mut engine,
            root,
            &home,
            &context,
            targets,
            capture::CaptureOptions {
                incomplete_reset: options.kind == Kind::Component,
                ..Default::default()
            },
        )?;
        let versions = workspace_command::semver_values(Some("reset"), &context)?;
        let semver = grammar::snapshot(versions.iter().map(String::as_str))
            .ok_or_else(|| decline("recovery semver grammar"))?;
        let plan: Value = engine.request(&json!({
            "kind":"commandRecoveryPlan","token":token,"current":capture.captured,
            "dependencyReadSet":capture.dependency_read_set(),"semver":semver,
        }))?;
        if plan.get("token").and_then(Value::as_str) != Some(&token) {
            return Err(decline("recovery plan token"));
        }
        let result = plan
            .get("result")
            .ok_or_else(|| decline("recovery result"))?
            .clone();
        format_result(&result, options.kind, Chalk::detect(&[]))?;
        let progress = Progress::parse(plan.get("progress"))?;
        let ids = install_ids(&result, options.kind)?;
        let removed_directories = if options.kind == Kind::Lane {
            array(result.get("restoredItems"), "restored items")?
                .iter()
                .filter_map(Value::as_str)
                .find_map(|item| {
                    item.strip_prefix("deleted components directories: ").map(str::to_string)
                })
        } else {
            None
        };
        Ok(Self {
            engine,
            token,
            context,
            capture,
            progress,
            ids,
            kind: options.kind,
            removed_directories,
        })
    }

    fn prompt(&self, chalk: Chalk) -> String {
        let directories = self.removed_directories
            .as_ref()
            .map(|dirs| {
                format!(
                    "\nThe following directories introduced by the merge will be deleted: {dirs}",
                )
            })
            .unwrap_or_default();
        format!(
            "Code changes that were done since the last lane-merge will be lost.{directories}\nThe .bitmap and workspace.jsonc files will be restored to the state before the merge.\nThis action is irreversible.\n{}",
            chalk.bold("Do you want to continue? [yes(y)/no(n)]"),
        )
    }

    fn commit(&mut self, root: &Path) -> io::Result<Value> {
        capture::commit(&mut self.engine, root, &self.context, &self.capture)?;
        let file_id = workspace_command::file_id();
        let mut read_set = self.capture.dependency_read_set();
        if self.kind == Kind::Lane {
            let restored: Value = self.engine.request(&json!({
                "kind":"commandRecoveryRestore","token":self.token,"fileId":file_id,
                "dependencyReadSet":read_set,
            }))?;
            if restored.get("restored") != Some(&Value::Bool(true)) {
                return Err(io::Error::other("recovery restore receipt"));
            }
            read_set =
                array(restored.get("dependencyReadSet"), "restored dependency read set")?.to_vec();
        }
        let applied: Value = self.engine.request(&json!({
            "kind":"commandRecoveryApply","token":self.token,"fileId":file_id,
            "dependencyReadSet":read_set,
        }))?;
        if applied.get("applied") != Some(&Value::Bool(true)) {
            return Err(io::Error::other("recovery apply receipt"));
        }
        Ok(applied
            .get("result")
            .ok_or_else(|| io::Error::other("recovery apply result"))?
            .clone())
    }
}

fn install_ids(result: &Value, kind: Kind) -> io::Result<Vec<String>> {
    if kind == Kind::Lane {
        return installation::component_ids(&result["checkoutResults"]);
    }
    let rows = array(result.get("abortedComponents"), "aborted components")?;
    let mut ids = rows
        .iter()
        .map(|row| Id::parse(text(row.get("id"))?).map(|id| id.display()))
        .collect::<io::Result<Vec<_>>>()?;
    ids.sort();
    ids.dedup();
    Ok(ids)
}

fn execute(
    root: &Path,
    args: &[OsString],
    output: &Output,
    mut prepared: Prepared,
    installer: Option<Installer>,
) -> io::Result<Report> {
    if let Some(progress) = &prepared.progress {
        progress.render_checkout(output);
    }
    let result = prepared.commit(root)?;
    let mut report = format_result(&result, prepared.kind, Chalk::detect(args))?;
    if let Some(installer) = installer
        && !prepared.ids.is_empty()
        && result.get("checkoutError").is_none()
        && let Err(error) = installer.install(root, false, &prepared.ids)
    {
        output.failure(&format!("installation failed with the following error: {error}"));
        report.data = Formatter::join(&[
            report.data,
            installation::error_report(Chalk::detect(args), &error.to_string()),
        ]);
    }
    Ok(report)
}

fn format_result(result: &Value, kind: Kind, chalk: Chalk) -> io::Result<Report> {
    if kind == Kind::Lane { format_lane(result, chalk) } else { format_component(result, chalk) }
}

fn format_component(result: &Value, chalk: Chalk) -> io::Result<Report> {
    let map = object(result)?;
    let rows = array(map.get("abortedComponents"), "aborted components")?;
    if map
        .keys()
        .any(|key| key != "abortedComponents")
        || rows.len() > 4096
    {
        return Err(decline("merge abort result"));
    }
    let format = Formatter::new(chalk);
    let items = rows
        .iter()
        .map(|row| Id::parse(text(row.get("id"))?).map(|id| format.item(&id.without_version())))
        .collect::<io::Result<Vec<_>>>()?;
    Ok(Report { data: format.section("merge aborted", "", &items), code: 0, details: None })
}

#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::too_many_local_bindings,
        reason = "Existing CLI orchestration is retained until its operation is decomposed"
    )
)]
fn format_lane(result: &Value, chalk: Chalk) -> io::Result<Report> {
    let map = object(result)?;
    let items = array(map.get("restoredItems"), "restored items")?;
    if map
        .keys()
        .any(|key| !matches!(key.as_str(), "checkoutResults" | "restoredItems" | "checkoutError"))
        || items.len() > 4096
    {
        return Err(decline("lane recovery result"));
    }
    let format = Formatter::new(chalk);
    let restored = items
        .iter()
        .map(|item| text(Some(item)).map(|item| format.item(item)))
        .collect::<io::Result<Vec<_>>>()?;
    let summary = format!(
        "{}\n{}",
        format.success_summary("The following have been restored successfully"),
        restored.join("\n"),
    );
    let checkout = match map
        .get("checkoutResults")
        .filter(|value| !value.is_null())
    {
        Some(result) => {
            let options = checkout::options::parse(&["reset", "--all", "-x"])
                .ok_or_else(|| decline("recovery checkout options"))?;
            checkout::report::format(result, &options, chalk)?
        }
        None => Report { data: String::new(), code: 0, details: None },
    };
    let error = map.get("checkoutError").filter(|value| !value.is_null())
        .map(|value| text(value.get("message")))
        .transpose()?
        .map(|message| chalk.red(&format!("\n\nFailed to change component files to the pre-merge state due to an error:\n{message}\nplease fix the error and then run \"bit checkout reset --all\" to revert the components to the pre-merge state")))
        .unwrap_or_default();
    Ok(Report {
        data: Formatter::join(&[checkout.data, summary.clone(), error.clone()]),
        code: checkout.code,
        details: checkout.details.map(|details| Formatter::join(&[details, summary, error])),
    })
}

//! Tester execution planning across [`Loaded`] components, [`Coverage`], and [`Session`] workers.
//!
//! [`Plan`] orchestrates single-component and [`multi`] Jest runs for [`Options`] and [`Settings`] into an [`Execution`] and [`Report`].
use super::{
    Execution, Options, config, coverage::Coverage, invalid, json, junit, multi, report,
    settings::Settings, summary, tool::Session,
};
use crate::commands::{
    color::Chalk,
    status::collate,
    workspace_command::{
        component_service::{Component, Loaded},
        results::Report,
    },
};
use std::{
    ffi::OsString,
    fs,
    io::{self, IsTerminal},
    path::Path,
};

/// Prepared tester execution plan holding [`Loaded`] component state, [`Session`] worker, and [`Coverage`] targets.
pub(super) struct Plan {
    /// Materialized workspace component state and progress metadata.
    loaded: Loaded,
    /// Active Jest worker [`Session`] when at least one test file matched.
    tool: Option<Session>,
    /// Per-component [`Coverage`] directory/main targets.
    coverage: Vec<Coverage>,
    /// Validated CLI [`Settings`] for the test run.
    settings: Settings,
    /// Number of components with runnable test files.
    runnable: usize,
    /// Bit 2.3.12 writes `JUnit` reports for explicit environment selections.
    environment_junit: bool,
}
impl Plan {
    /// Parses [`Settings`], loads [`Component`] state, and prepares the Jest worker [`Session`] and [`Coverage`] targets for `root` ([`Path`]).
    pub(super) fn prepare(root: &Path, args: &[OsString], options: &Options) -> io::Result<Self> {
        let settings = Settings::parse(root, args, options)?;
        let environment_junit =
            if settings.environment.is_some() && settings.junit.is_some() {
                let cli = crate::commands::workspace_command::NodeCli::find()?;
                let version = node_semver::Version::parse(cli.version).map_err(io::Error::other)?;
                (version.major, version.minor, version.patch) >= (2, 3, 12)
            } else {
                false
            };
        let loaded = Loaded::prepare(root, &settings.selection)?;
        let components = loaded.components()?;
        validate_environment(&components, &settings, &loaded.progress.environment)?;
        let request = if components.len() > 1 {
            multi::request(root, &components, &loaded.progress.environment, &settings)?
        } else {
            components
                .first()
                .map(|component| {
                    config::request(root, component, &loaded.progress.environment, &settings)
                })
                .transpose()?
                .flatten()
        };
        let streamed = !options.json && !settings.summary && request.is_some();
        let runnable = if !streamed {
            0
        } else if components.len() <= 1 {
            usize::from(request.is_some())
        } else {
            count_runnable(root, &components, &loaded.progress.environment, &settings)?
        };
        validate_streaming(streamed, &loaded)?;
        let tool = request
            .as_ref()
            .map(|request| Session::prepare(request, Chalk::detect(args).enabled(), args, streamed))
            .transpose()?;
        validate_sources(&loaded.files)?;
        let coverage = prepare_coverage(root, &components, tool.is_some())?;
        Ok(Self { loaded, tool, coverage, settings, runnable, environment_junit })
    }
    /// Commits [`Loaded`] caches, runs the Jest worker [`Session`], collects [`Coverage`], and formats the [`Execution`] and [`Report`].
    pub(super) fn run(
        &mut self,
        root: &Path,
        output: &bit_install::output::Output,
        text: bool,
        chalk: Chalk,
    ) -> io::Result<Execution> {
        self.loaded.commit(root)?;
        self.progress(output, text);
        let Some(identity) = self.loaded.progress.identities.first() else {
            return Ok(Execution {
                report: Report { data: "[]".to_owned(), code: 0, details: None },
                terminated: false,
                empty: true,
            });
        };
        if text && !self.settings.summary {
            output.console(&format!(
                "testing total of {} components in workspace '{}'",
                self.loaded.progress.identities.len(),
                chalk.cyan(self.loaded.progress.name.trim()),
            ));
            if self.tool.is_some() {
                output.console(&format!(
                    "testing {} components with environment {}\n",
                    self.runnable,
                    chalk.cyan(self.loaded.progress.environment.trim()),
                ));
            }
        }
        let mut result = self.tool
            .as_mut()
            .map_or_else(|| Ok(json!({"results":{"testResults":[]}})), Session::run)?;
        if self.coverage.len() == 1 {
            self.coverage[0].collect(root, &mut result);
        } else if !self.coverage.is_empty() {
            Coverage::collect_many(&self.coverage, root, &mut result);
        }
        self.report_service_error(output, text, &result);
        let terminated = result.get("terminated").is_some();
        let report = self.format_report(root, &result, identity, terminated, text)?;
        Ok(Execution { report, terminated, empty: false })
    }
    #[inline]
    fn progress(&self, output: &bit_install::output::Output, text: bool) {
        if text && self.settings.files.is_empty() {
            for count in &self.loaded.progress.loads {
                if *count > 0 {
                    output.status(&format!("loading {count} component(s)"));
                }
            }
        }
    }
    #[inline]
    fn report_service_error(
        &self,
        output: &bit_install::output::Output,
        text: bool,
        result: &serde_json::Value,
    ) {
        if text && !self.settings.summary && result.get("error").is_some() {
            let err_msg = result["errorMessage"]
                .as_str()
                .map(str::trim)
                .filter(|msg| !msg.is_empty())
                .unwrap_or("undefined");
            let environment = self.loaded.progress.environment.trim();
            output.failure(&format!(
                r#"service "tester" of env "{environment}" has failed. error: {err_msg}"#,
            ));
        }
    }
    fn format_report(
        &self,
        root: &Path,
        result: &serde_json::Value,
        identity: &str,
        terminated: bool,
        text: bool,
    ) -> io::Result<Report> {
        let components = self.loaded.components()?;
        let summary_mode = (self.settings.summary || text) && !terminated;
        if summary_mode && components.len() > 1 && self.settings.junit.is_none() {
            return multi::report_summary(
                root,
                result,
                &components,
                &self.loaded.progress.identities,
                &self.loaded.progress.environment,
            );
        }
        let mut report = if components.len() > 1 {
            multi::report_detail(root, result, &components, &self.loaded.progress.identities)?
        } else {
            report::report(result, identity)?
        };
        self.write_junit(root, result, &components, &report, terminated)?;
        if summary_mode {
            if components.len() > 1 {
                return multi::report_summary(
                    root,
                    result,
                    &components,
                    &self.loaded.progress.identities,
                    &self.loaded.progress.environment,
                );
            }
            report.data = summary::render(
                &report.data,
                identity,
                &self.loaded.progress.environment,
                result["errorMessage"]
                    .as_str()
                    .map(str::trim)
                    .filter(|msg| !msg.is_empty()),
            )?;
        }
        Ok(report)
    }
    fn write_junit(
        &self,
        root: &Path,
        result: &serde_json::Value,
        components: &[Component],
        report: &Report,
        terminated: bool,
    ) -> io::Result<()> {
        if terminated || (self.settings.environment.is_some() && !self.environment_junit) {
            return Ok(());
        }
        let Some(path) = &self.settings.junit else {
            return Ok(());
        };
        if components.len() > 1 {
            let raw =
                multi::junit_rows(root, result, components, &self.loaded.progress.identities)?;
            junit::write(path, &report.data, &raw)
        } else {
            junit::write(path, &report.data, result)
        }
    }
}
#[inline]
fn validate_sources(files: &[serde_json::Value]) -> io::Result<()> {
    for file in files {
        let path = file["absolutePath"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| invalid("tester source path"))?;
        if fs::read_to_string(path)? != file["source"].as_str().unwrap_or_default() {
            return Err(invalid("tester source changed during preparation"));
        }
    }
    Ok(())
}

#[inline]
fn prepare_coverage(
    root: &Path,
    components: &[Component],
    enabled: bool,
) -> io::Result<Vec<Coverage>> {
    if enabled {
        components
            .iter()
            .map(|component| Coverage::prepare(root, &component.directory))
            .collect()
    } else {
        Ok(Vec::new())
    }
}
fn count_runnable(
    root: &Path,
    components: &[Component],
    environment: &str,
    settings: &Settings,
) -> io::Result<usize> {
    let mut count = 0;
    for component in components {
        if config::request_with_empty(root, component, environment, settings)?.1 {
            count += 1;
        }
    }
    Ok(count)
}

fn validate_streaming(streamed: bool, loaded: &Loaded) -> io::Result<()> {
    if streamed && (io::stdout().is_terminal() || io::stderr().is_terminal()) {
        return Err(invalid("tester text reporting"));
    }
    if streamed
        && loaded.progress.identities.len() > 1
        && (!collate::root_locale()
            || loaded.progress.identities
                .iter()
                .any(|id| !collate::supported(id)))
    {
        return Err(invalid("tester text collation"));
    }
    Ok(())
}

#[inline]
fn validate_environment(
    components: &[Component],
    settings: &Settings,
    environment: &str,
) -> io::Result<()> {
    let loaded_env = environment.trim();
    if !components.is_empty()
        && settings.environment
            .as_deref()
            .map(str::trim)
            .filter(|env| !env.is_empty())
            .is_some_and(|env| {
                env != loaded_env
                    && bit_install::config::aspect_id_without_version(loaded_env) != env
            })
    {
        return Err(invalid("tester environment selection"));
    }
    Ok(())
}

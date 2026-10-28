use super::{
    Execution, Options, config, coverage::Coverage, invalid, json, junit, multi, report,
    settings::Settings, summary, tool::Session,
};
use crate::commands::{
    color::Chalk,
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

pub(super) struct Plan {
    loaded: Loaded,
    tool: Option<Session>,
    coverage: Vec<Coverage>,
    settings: Settings,
}
impl Plan {
    pub(super) fn prepare(root: &Path, args: &[OsString], options: &Options) -> io::Result<Self> {
        let settings = Settings::parse(root, args, options)?;
        let loaded = Loaded::prepare(root, &settings.selection)?;
        let components = loaded.components()?;
        if !components.is_empty()
            && settings.environment
                .as_ref()
                .is_some_and(|env| env != &loaded.progress.environment)
        {
            return Err(invalid("tester environment selection"));
        }
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
        if streamed
            && (components.len() != 1
                || settings.files.len() != 1
                || io::stdout().is_terminal()
                || io::stderr().is_terminal())
        {
            return Err(invalid("tester text reporting"));
        }
        let tool = request
            .as_ref()
            .map(|request| Session::prepare(request, Chalk::detect(args).enabled(), args, streamed))
            .transpose()?;
        validate_sources(&loaded.files)?;
        let coverage = prepare_coverage(root, &components, tool.is_some())?;
        Ok(Self { loaded, tool, coverage, settings })
    }
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
                chalk.cyan(&self.loaded.progress.name),
            ));
            if self.tool.is_some() {
                output.console(&format!(
                    "testing 1 components with environment {}\n",
                    chalk.cyan(&self.loaded.progress.environment),
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
        let terminated = result.get("terminated").is_some();
        let report = self.format_report(root, &result, identity, terminated, text)?;
        Ok(Execution { report, terminated, empty: false })
    }
    fn progress(&self, output: &bit_install::output::Output, text: bool) {
        if text && self.settings.files.is_empty() {
            for count in &self.loaded.progress.loads {
                if *count > 0 {
                    output.status(&format!("loading {count} component(s)"));
                }
            }
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
        let mut report = if components.len() > 1 {
            multi::report_detail(root, result, &components, &self.loaded.progress.identities)?
        } else {
            report::report(result, identity)?
        };
        self.write_junit(root, result, &components, &report, terminated)?;
        if (self.settings.summary || text) && !terminated {
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
                result["errorMessage"].as_str(),
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
        if terminated || self.settings.environment.is_some() {
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
fn validate_sources(files: &[serde_json::Value]) -> io::Result<()> {
    for file in files {
        let path = file["absolutePath"].as_str().ok_or_else(|| invalid("tester source path"))?;
        if fs::read_to_string(path)? != file["source"].as_str().unwrap_or_default() {
            return Err(invalid("tester source changed during preparation"));
        }
    }
    Ok(())
}

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

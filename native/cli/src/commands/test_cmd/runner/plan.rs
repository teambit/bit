use super::{
    Execution, Options, config, coverage::Coverage, invalid, json, report, settings::Settings,
    summary, tool::Session,
};
use crate::commands::{
    color::Chalk,
    workspace_command::{component_service::Loaded, results::Report},
};
use std::{ffi::OsString, fs, io, path::Path};

pub(super) struct Plan {
    loaded: Loaded,
    tool: Option<Session>,
    coverage: Option<Coverage>,
    settings: Settings,
}
impl Plan {
    pub(super) fn prepare(root: &Path, args: &[OsString], options: &Options) -> io::Result<Self> {
        let settings = Settings::parse(root, args, options)?;
        let loaded = Loaded::prepare(root, &settings.selection)?;
        let components = loaded.components()?;
        if components.len() > 1 {
            return Err(invalid("tester multiple component services"));
        }
        let request = components
            .first()
            .map(|component| {
                config::request(root, component, &loaded.progress.environment, &settings)
            })
            .transpose()?
            .flatten();
        let tool = request
            .as_ref()
            .map(|request| Session::prepare(request, Chalk::detect(args).enabled(), args))
            .transpose()?;
        validate_sources(&loaded.files)?;
        let coverage = if tool.is_some() {
            components
                .first()
                .map(|component| Coverage::prepare(root, &component.directory))
                .transpose()?
        } else {
            None
        };
        Ok(Self { loaded, tool, coverage, settings })
    }
    pub(super) fn run(&mut self, root: &Path) -> io::Result<Execution> {
        self.loaded.commit(root)?;
        let Some(identity) = self.loaded.progress.identities.first() else {
            return Ok(Execution {
                report: Report { data: "[]".to_owned(), code: 0, details: None },
                terminated: false,
            });
        };
        let mut result = self.tool
            .as_mut()
            .map_or_else(|| Ok(json!({"results":{"testResults":[]}})), Session::run)?;
        if let Some(coverage) = &self.coverage {
            coverage.collect(root, &mut result);
        }
        let terminated = result.get("terminated").is_some();
        let mut report = report::report(&result, identity)?;
        if self.settings.summary && !terminated {
            report.data = summary::render(
                &report.data,
                identity,
                &self.loaded.progress.environment,
                result["errorMessage"].as_str(),
            )?;
        }
        Ok(Execution { report, terminated })
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

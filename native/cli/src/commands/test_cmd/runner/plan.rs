use super::{Execution, Options, config, coverage::Coverage, invalid, json, report, tool::Session};
use crate::commands::{
    color::Chalk,
    workspace_command::{
        component_service::{Loaded, Selection},
        results::Report,
    },
};
use std::{ffi::OsString, fs, io, path::Path};

pub(super) struct Plan {
    loaded: Loaded,
    tool: Option<Session>,
    coverage: Option<Coverage>,
}
impl Plan {
    pub(super) fn prepare(root: &Path, args: &[OsString], options: &Options) -> io::Result<Self> {
        let selection = selection(args, options)?;
        let loaded = Loaded::prepare(root, &selection)?;
        let components = loaded.components()?;
        if components.len() > 1 {
            return Err(invalid("tester multiple component services"));
        }
        let request = components
            .first()
            .map(|component| config::request(root, component, &loaded.progress.environment))
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
        Ok(Self { loaded, tool, coverage })
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
        Ok(Execution {
            report: report::report(&result, identity)?,
            terminated: result.get("terminated").is_some(),
        })
    }
}
fn selection(args: &[OsString], options: &Options) -> io::Result<Selection> {
    if !options.json {
        return Err(invalid("tester text reporting"));
    }
    if options.user_pattern
        .iter()
        .any(|value| Path::new(value).is_file())
    {
        return Err(invalid("tester explicit file selection"));
    }
    let mut all = false;
    for argument in args.iter().skip(1) {
        let argument = argument.to_str().ok_or_else(|| invalid("tester argument"))?;
        match argument {
            "--" => break,
            "--json" | "-j" => {}
            "--unmodified" | "-u" => all = true,
            value if value.starts_with('-') => return Err(invalid("tester runtime option")),
            _ => {}
        }
    }
    let pattern =
        (!options.user_pattern.is_empty()).then(|| options.user_pattern.join(", "));
    Ok(Selection { pattern, changed: !all, ..Selection::default() })
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

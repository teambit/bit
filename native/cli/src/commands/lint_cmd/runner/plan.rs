use super::{Options, Value, config::Config, invalid, json, results, tool::Session};
use crate::commands::{
    color::Chalk,
    workspace_command::component_service::{Component, Loaded, Selection, filesystem},
};
use std::{ffi::OsString, fs, io, path::Path};

pub(super) struct Plan {
    pub loaded: Loaded,
    components: Vec<Component>,
    config: Option<Config>,
    tools: Vec<Session>,
}

impl Plan {
    pub(super) fn prepare(root: &Path, args: &[OsString], options: &Options) -> io::Result<Self> {
        let selection = Selection {
            pattern: options.pattern.clone(),
            changed: options.changed,
            allow_cached_pair: false,
            ..Selection::default()
        };
        let loaded = Loaded::prepare(root, &selection)?;
        let components = loaded.components()?;
        if components.len() > 8
            || (options.fix
                && components
                    .iter()
                    .any(|component| component.files.len() > 1))
        {
            return Err(invalid("linter unsupported write batch"));
        }
        let directories = components
            .iter()
            .map(|component| component.directory.as_str())
            .collect::<Vec<_>>();
        let config =
            if directories.is_empty() { None } else { Some(Config::prepare(root, &directories)?) };
        let mut tools = Vec::new();
        if let Some(config) = &config {
            for component in &components {
                tools.push(Session::prepare(
                    &request(component, config, options)?,
                    Chalk::detect(args).enabled(),
                )?);
            }
        }
        validate_sources(&loaded.files)?;
        Ok(Self { loaded, components, config, tools })
    }

    pub(super) fn run(
        &mut self,
        root: &Path,
        output: &bit_install::output::Output,
        fix: bool,
    ) -> io::Result<Value> {
        self.loaded.commit(root)?;
        for count in &self.loaded.progress.loads {
            if *count > 0 {
                output.status(&format!("loading {count} component(s)"));
            }
        }
        if self.components.is_empty() {
            return Ok(results::aggregate(Vec::new(), Vec::new()));
        }
        let total = self.components.len();
        output.status(&format!("linting components (total: {total})"));
        if let Some(error) = self.config
            .as_ref()
            .ok_or_else(|| invalid("linter config"))?
            .publish()?
        {
            return failure(error, &self.loaded.progress.environment, output);
        }
        self.lint_components(output, fix)
    }
    fn lint_components(
        &mut self,
        output: &bit_install::output::Output,
        fix: bool,
    ) -> io::Result<Value> {
        let total = self.components.len();
        let mut rows = Vec::new();
        for (index, (component, tool)) in self.components
            .iter()
            .zip(&mut self.tools)
            .enumerate()
        {
            output.status(&format!(
                "linting components ({}/{total}) component: {}, # of files: {}",
                index + 1,
                self.loaded.progress.identities[index],
                component.files.len(),
            ));
            let result = tool.run()?;
            if let Some(error) = result.get("error") {
                output.failure(&format!(
                    r#"service "linter" of env "{}" has failed. error: {}"#,
                    self.loaded.progress.environment,
                    result["message"].as_str().unwrap_or_default(),
                ));
                return Ok(results::aggregate(Vec::new(), vec![error.clone()]));
            }
            if fix && let Some(error) = write(&result)? {
                return failure(error, &self.loaded.progress.environment, output);
            }
            rows.push(results::component(&component.id, &result)?);
        }
        Ok(results::aggregate(rows, Vec::new()))
    }
}

fn request(component: &Component, config: &Config, options: &Options) -> io::Result<Value> {
    // Built-in configuration from public @teambit/react.eslint-config-bit-react 2.0.27 (Apache-2.0).
    let mut defaults: Value = serde_json::from_str(include_str!("default_eslint.json"))?;
    defaults["parserOptions"] = json!({"project":config.path});
    let extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".md", ".mdx"];
    let files: Vec<_> = component.files
        .iter()
        .filter(|file| {
            file["filePath"]
                .as_str()
                .is_some_and(|path| {
                    extensions
                        .iter()
                        .any(|extension| path.ends_with(extension))
                })
        })
        .map(|file| file["absolutePath"].clone())
        .collect();
    if files.is_empty() {
        return Err(invalid("linter empty file selection"));
    }
    let fixes: Vec<_> = options.fix_type
        .as_deref()
        .unwrap_or("layout,problem,suggestion")
        .split(',')
        .collect();
    Ok(json!({"files":files,"options":{"overrideConfig":defaults,"extensions":extensions,
        "useEslintrc":false,"fix":options.fix,"fixTypes":fixes}}))
}

fn write(tool: &Value) -> io::Result<Option<Value>> {
    let files = tool["results"].as_array().ok_or_else(|| invalid("linter write results"))?;
    for file in files {
        if let Some(content) = file["output"].as_str() {
            let path =
                Path::new(file["filePath"].as_str().ok_or_else(|| invalid("linter write path"))?);
            if let Err(error) = fs::write(path, content) {
                return filesystem::error(error, path, "open").map(Some);
            }
        }
    }
    Ok(None)
}

fn failure(
    error: Value,
    environment: &str,
    output: &bit_install::output::Output,
) -> io::Result<Value> {
    output.failure(&filesystem::message("linter", environment, &error)?);
    Ok(results::aggregate(Vec::new(), vec![error]))
}

fn validate_sources(files: &[Value]) -> io::Result<()> {
    for file in files {
        let path = file["absolutePath"].as_str().ok_or_else(|| invalid("linter file path"))?;
        if fs::read_to_string(path)? != file["source"].as_str().unwrap_or_default() {
            return Err(invalid("linter source changed"));
        }
    }
    Ok(())
}

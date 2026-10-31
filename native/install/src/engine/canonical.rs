//! Run the published `lynx.install` package step in this process after its
//! retained `InstallMain` and dependency-installer callbacks have finished.

mod environment;
mod parse;
mod settings;

#[cfg(test)]
mod tests;

use super::{EngineInstallOptions, EngineResult, EngineSettings, OutputSink, run};
use crate::{host::HostInfo, model::InstallPlan};
use serde_json::Value;
use std::io;

/// Fully validated package-manager inputs. Constructing this performs no
/// package-manager write, so an unsupported request can run the published
/// package manager once with its original arguments.
pub struct CanonicalInstall {
    settings: EngineSettings,
    options: EngineInstallOptions,
    plan: InstallPlan,
    payload: Value,
    info: HostInfo,
}

impl CanonicalInstall {
    /// Return `None` before build-script PATH preparation or engine effects.
    #[must_use]
    pub fn prepare(payload: &Value, info: &HostInfo) -> Option<Self> {
        let request = parse::Request::new(payload)?;
        if !request.environment.can_inherit_parent() {
            return None;
        }
        let (settings, options, plan) = settings::prepare(&request, info)?;
        Some(Self { settings, options, plan, payload: payload.clone(), info: info.clone() })
    }

    /// Run the already accepted package step after the retained Host prepares
    /// its published node-gyp PATH.
    pub async fn run(
        mut self,
        build_scripts_path: String,
        output: Option<OutputSink>,
    ) -> io::Result<EngineResult> {
        if build_scripts_path.trim().is_empty() {
            return Err(io::Error::other("retained build scripts PATH is empty"));
        }
        let environment = self.payload["environment"]
            .as_object_mut()
            .ok_or_else(|| io::Error::other("retained Host environment unavailable"))?;
        environment.retain(|key, _| !key.eq_ignore_ascii_case("PATH"));
        environment.insert("PATH".to_string(), Value::String(build_scripts_path.clone()));
        let request = parse::Request::new(&self.payload)
            .ok_or_else(|| io::Error::other("retained package inputs changed after PATH setup"))?;
        let (settings, options, plan) = settings::prepare(&request, &self.info)
            .ok_or_else(|| {
                io::Error::other("retained pnpm configuration changed after PATH setup")
            })?;
        self.settings = settings;
        self.options = options;
        self.plan = plan;
        self.settings.set_build_scripts_path(build_scripts_path);
        self.options.output = output;
        run::install(&self.plan, &self.settings, &self.options).await
    }
}

/// The mapped values are complete before `run::install` begins effects.
type Prepared = (super::EngineSettings, EngineInstallOptions, InstallPlan);

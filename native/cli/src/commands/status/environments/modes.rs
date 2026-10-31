//! Retained callback sessions change operation without replaying providers.
use super::{Environments, Host, Path, Value, component, io, json, text};

impl Environments {
    pub(in crate::commands) fn for_stash_callbacks() -> Self {
        Self::new()
    }

    /// Invoke registered add/compile callbacks after Rust restores stashed sources and bitmap.
    pub(in crate::commands) fn stash_added(
        &mut self,
        root: &Path,
        ids: &[String],
    ) -> io::Result<String> {
        let ids = ids
            .iter()
            .map(String::as_str)
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .collect::<Vec<_>>();
        if ids.is_empty() {
            return Ok(String::new());
        }
        let host = self.host(root)?;
        host.call("stashAdded", &json!({"ids":ids}))?;
        Ok(host.take_stdout())
    }
    pub(in crate::commands) fn from_host(host: Host) -> Self {
        Self { host: Some(host), ..Self::new() }
    }

    pub(in crate::commands) fn continue_snapshot(self, build: bool) -> io::Result<Self> {
        if let Some(host) = &self.host {
            host.call("snapshotContinuation", &json!({}))?;
        }
        Ok(self.for_snapshot_build(build))
    }

    pub(in crate::commands) fn for_snapshot_build(mut self, build: bool) -> Self {
        self.snapshot = true;
        self.snapshot_build = build;
        self
    }

    pub(in crate::commands::status) fn is_snapshot(&self) -> bool {
        self.snapshot
    }

    pub(in crate::commands) fn for_checkout(mut self) -> Self {
        self.checkout = true;
        self
    }

    /// Import publishes eligible dependency data before actual onLoad subscribers run.
    pub(in crate::commands) fn for_import_callbacks(mut self, cache_initialized: bool) -> Self {
        self.import = Some(cache_initialized);
        self
    }

    pub(in crate::commands::status) fn is_import(&self) -> bool {
        self.import.is_some()
    }

    pub(in crate::commands::status) fn import_cache_initialized(&self) -> bool {
        self.import == Some(true)
    }

    pub(in crate::commands::status) fn is_checkout(&self) -> bool {
        self.checkout
    }

    pub(in crate::commands) fn with_issue_facts(mut self, enabled: bool) -> Self {
        self.issue_facts = enabled;
        self
    }
}

pub(in crate::commands::status) fn dev_files(
    root: &Path,
    context: &Value,
    target: &Value,
    files: &[String],
) -> io::Result<Vec<String>> {
    use bit_install::dependencies::{DevPatternConfig, EnvDevPatterns, dev_files, dev_patterns};
    let mut comp = component(root, context, target)?;
    comp.files = files.to_vec();
    let identity = text(target.get("identity"))?.trim();
    let facts = &context["environmentFacts"][identity];
    comp.env_id = facts["envId"]
        .as_str()
        .map(str::trim)
        .filter(|env_id| !env_id.is_empty())
        .unwrap_or(&comp.env_id)
        .to_owned();
    let hooks = &facts["devPatterns"];
    let list = |key: &str| {
        hooks
            .get(key)
            .filter(|value| !value.is_null())
            .map(strings)
    };
    let env = EnvDevPatterns {
        patterns: facts
            .get("manifestPatterns")
            .filter(|value| !value.is_null())
            .or_else(|| {
                hooks
                    .get("devPatterns")
                    .filter(|value| !value.is_null())
            })
            .cloned(),
        tests: list("tests"),
        docs: list("docs"),
        compositions: list("compositions"),
    };
    let config = DevPatternConfig::from_aspects(&|id| {
        crate::commands::update_cmd::aspect_entry(&context["workspace"], id)
            .map(|(_, val)| val.clone())
    });
    Ok(dev_files(&comp, &dev_patterns(&comp, &config, &env)))
}

fn strings(value: &Value) -> Vec<String> {
    match value {
        Value::Array(values) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_owned)
            .collect(),
        Value::String(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() { Vec::new() } else { vec![trimmed.to_owned()] }
        }
        _ => Vec::new(),
    }
}

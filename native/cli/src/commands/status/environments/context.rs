//! Initialize provider callbacks before native command controls are captured.
use super::{
    Environments, WorkspaceComponent, array, component, core_ids, needs_facts, root_aspects,
};
use serde_json::{Value, json};
use std::{io, path::Path};

/// Initialize configured providers, then capture controls after their canonical bootstrap writes.
pub(in crate::commands) fn read_context(
    engine: &mut crate::commands::engine::Engine,
    root: &Path,
    home: &Path,
    history: bool,
    pattern: Option<&str>,
    startup: &mut crate::commands::status::autosync::Startup,
) -> io::Result<(Value, Environments)> {
    read_context_with(engine, root, home, history, pattern, startup, None)
}

/// Snapshot-specific provider startup precedes native command control receipts.
pub(in crate::commands) fn read_snapshot_context(
    engine: &mut crate::commands::engine::Engine,
    root: &Path,
    home: &Path,
    build: bool,
    startup: &mut crate::commands::status::autosync::Startup,
) -> io::Result<(Value, Environments)> {
    read_context_with(engine, root, home, false, None, startup, Some(build))
}

fn read_context_with(
    engine: &mut crate::commands::engine::Engine,
    root: &Path,
    home: &Path,
    history: bool,
    pattern: Option<&str>,
    startup: &mut crate::commands::status::autosync::Startup,
    snapshot: Option<bool>,
) -> io::Result<(Value, Environments)> {
    crate::commands::status::autosync::run(engine, root, startup)?;
    let request = json!({"kind":"statusContext","root":root,"home":home,"history":history});
    let mut context: Value = engine.request(&request)?;
    let selected = crate::commands::diff::selection::select(
        array(context.get("targets"), "environment targets")?,
        pattern,
    )?;
    let mut environments = Environments::new();
    if let Some(build) = snapshot {
        environments = environments.for_snapshot_build(build);
    }
    if Environments::require_native_write_for(root, &context, &selected).is_err() {
        startup.committed = true;
    }
    bootstrap_owned(&mut environments, root, &context, &selected, startup)?;
    if let Some(build) = snapshot
        && (build || super::snapshot::configured(engine, root, &context)?)
    {
        startup.committed = true;
        environments
            .host(root)?
            .call("dependencyPolicies", &json!({"extensionIds":[]}))?;
    }
    if environments.host.is_some() {
        context = engine
            .request(&request)
            .inspect_err(|_error| {
                if let Some(host) = &environments.host {
                    startup.stdout.push_str(&host.take_stdout());
                }
            })?;
    }
    Ok((context, environments))
}

fn bootstrap_owned(
    environments: &mut Environments,
    root: &Path,
    context: &Value,
    targets: &[Value],
    startup: &mut crate::commands::status::autosync::Startup,
) -> io::Result<()> {
    environments
        .bootstrap(root, context, targets)
        .inspect_err(|_error| {
            if let Some(host) = &environments.host {
                startup.stdout.push_str(&host.take_stdout());
            }
        })
}

impl Environments {
    pub(super) fn bootstrap(
        &mut self,
        root: &Path,
        context: &Value,
        targets: &[Value],
    ) -> io::Result<()> {
        let components = targets
            .iter()
            .map(|target| component(root, context, target))
            .collect::<io::Result<Vec<_>>>()?;
        let core = core_ids()?;
        self.prime(root, &components, &core, &root_aspects(context, &core))
    }

    pub(super) fn prime(
        &mut self,
        root: &Path,
        components: &[WorkspaceComponent],
        core: &[String],
        aspects: &[String],
    ) -> io::Result<()> {
        if components.iter().any(|component| needs_facts(component, core, aspects)) {
            let mut ids = aspects
                .iter()
                .chain(components.iter().flat_map(|component| component.config.keys()))
                .filter(|id| !core.contains(id) && !bit_install::policy::is_core_env(id))
                .collect::<Vec<_>>();
            let mut seen = std::collections::HashSet::new();
            ids.retain(|id| seen.insert(*id));
            let record = self.snapshot
                && components
                    .iter()
                    .any(|component| {
                        !bit_install::policy::is_core_env(&component.env_id)
                            && !aspects.contains(&component.env_id)
                    });
            let host = self.host(root)?;
            if record {
                host.call("snapshotLoadFacts", &json!({}))?;
            }
            host.call(
                "dependencyPolicies",
                &json!({"extensionIds":ids,"bootstrap":ids.iter().any(|id|aspects.contains(id))}),
            )?;
            if record {
                let facts = host.call("snapshotLoadFacts", &json!({}))?;
                self.snapshot_loads.extend(
                    array(Some(&facts), "snapshot environment loads")?.iter().cloned(),
                );
            }
        }
        Ok(())
    }
}

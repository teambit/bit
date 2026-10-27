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
    read_context_with(engine, root, home, history, pattern, startup, ContextSetup::default())
}

/// Snapshot-specific provider startup precedes native command control receipts.
pub(in crate::commands) fn read_snapshot_context(
    engine: &mut crate::commands::engine::Engine,
    root: &Path,
    home: &Path,
    build: bool,
    startup: &mut crate::commands::status::autosync::Startup,
) -> io::Result<(Value, Environments)> {
    read_context_with(
        engine,
        root,
        home,
        false,
        None,
        startup,
        ContextSetup { snapshot: Some(build), inherited: None },
    )
}

/// Installation process facts share a Host, while ordinary provider startup still runs.
pub(in crate::commands) fn read_inherited_context(
    engine: &mut crate::commands::engine::Engine,
    root: &Path,
    home: &Path,
    pattern: Option<&str>,
    startup: &mut crate::commands::status::autosync::Startup,
    inherited: Environments,
) -> io::Result<(Value, Environments)> {
    read_context_with(
        engine,
        root,
        home,
        false,
        pattern,
        startup,
        ContextSetup { snapshot: None, inherited: Some(inherited) },
    )
}
#[derive(Default)]
struct ContextSetup {
    snapshot: Option<bool>,
    inherited: Option<Environments>,
}

fn read_context_with(
    engine: &mut crate::commands::engine::Engine,
    root: &Path,
    home: &Path,
    history: bool,
    pattern: Option<&str>,
    startup: &mut crate::commands::status::autosync::Startup,
    setup: ContextSetup,
) -> io::Result<(Value, Environments)> {
    crate::commands::status::autosync::run(engine, root, startup)?;
    let request = json!({"kind":"statusContext","root":root,"home":home,"history":history});
    let mut context: Value = engine.request(&request)?;
    let selected = crate::commands::diff::selection::select(
        array(context.get("targets"), "environment targets")?,
        pattern,
    )?;
    let mut environments = setup.inherited.unwrap_or_else(Environments::new);
    if let Some(build) = setup.snapshot {
        environments = environments.for_snapshot_build(build);
    }
    bootstrap_owned(&mut environments, root, &context, &selected, startup)?;
    if let Some(build) = setup.snapshot
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
    let components = targets
        .iter()
        .map(|target| component(root, context, target))
        .collect::<io::Result<Vec<_>>>()?;
    let core = core_ids()?;
    let aspects = root_aspects(context, &core);
    if components.iter().any(|component| needs_facts(component, &core, &aspects)) {
        startup.committed = true;
    }
    environments
        .prime(root, &components, &core, &aspects)
        .inspect_err(|_error| {
            if let Some(host) = &environments.host {
                startup.stdout.push_str(&host.take_stdout());
            }
        })
}

impl Environments {
    pub(super) fn prime(
        &mut self,
        root: &Path,
        components: &[WorkspaceComponent],
        core: &[String],
        aspects: &[String],
    ) -> io::Result<()> {
        if !components
            .iter()
            .any(|component| {
                needs_facts(component, core, aspects)
                    && !(self.builtin_services != super::builtin::Services::Disabled
                        && super::builtin::supported(component, core, aspects))
            })
        {
            return Ok(());
        }
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
        let used_extensions = used_extensions(components);
        host.call(
            "dependencyPolicies",
            &json!({"extensionIds":ids,"bootstrap":ids.iter().any(|id|aspects.contains(id)),"startupAspectIds":aspects,"componentAspectIds":components.iter().flat_map(|component|component.config.keys()).collect::<Vec<_>>(),"componentIdentities":components.iter().map(|component|component.id.to_string_without_version()).collect::<Vec<_>>(),"componentUsedExtensions":used_extensions}),
        )?;
        if record {
            let facts = host.call("snapshotLoadFacts", &json!({}))?;
            self.snapshot_loads.extend(
                array(Some(&facts), "snapshot environment loads")?.iter().cloned(),
            );
        }
        Ok(())
    }
}

fn used_extensions(components: &[WorkspaceComponent]) -> Vec<Value> {
    components
        .iter()
        .map(|component| {
            let mut used = component.config
                .keys()
                .cloned()
                .collect::<Vec<_>>();
            if !used.contains(&component.env_id) {
                used.push(component.env_id.clone());
            }
            json!({"id":component.id.to_string_without_version(),"usedIds":used})
        })
        .collect()
}

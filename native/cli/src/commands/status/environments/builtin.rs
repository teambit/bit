//! Fixed built-in React facts for qualified component service loading.
use super::{
    Environments, WorkspaceComponent, array, component, core_ids, needs_facts, root_aspects,
};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn supported(
    component: &WorkspaceComponent,
    core: &[String],
    aspects: &[String],
) -> bool {
    !component.is_env
        && component.env_id == "teambit.react/react"
        && aspects.is_empty()
        && component.config
            .keys()
            .all(|id| {
                core.contains(id)
                    && (!bit_install::policy::is_core_env(id) || id == "teambit.react/react")
            })
}

pub(super) fn facts(component: &WorkspaceComponent, issues: bool) -> Value {
    let explicit = component.config
        .get("teambit.envs/envs")
        .and_then(|config| config["env"].as_str())
        .is_some();
    let multiple = if explicit {
        Vec::new()
    } else {
        component.config
            .keys()
            .filter(|id| bit_install::policy::is_core_env(id))
            .cloned()
            .collect()
    };
    json!({"envId":"teambit.react/react","envPolicy":{
        "dependencies":{"react":"-","react-dom":"-","core-js":"^3.0.0"},
        "devDependencies":{"react":"-","react-dom":"-","@types/mocha":"-","@types/node":"12.20.4",
            "@types/react":"^19.0.0","@types/react-dom":"^19.0.0","@types/jest":"^26.0.0",
            "@babel/runtime":"7.20.0","@types/testing-library__jest-dom":"5.9.5"},
        "peerDependencies":{"react":"^17.0.0 || ^18.0.0 || ^19.0.0","react-dom":"^17.0.0 || ^18.0.0 || ^19.0.0"}},
        "compiler":if issues {json!({"hasCompiler":true,"distDir":"dist"})} else {Value::Null},
        "nonLoaded":false,"devPatterns":{"devPatterns":null,"tests":null,"docs":null,"compositions":null},
        "multiple":multiple,"manifestPatterns":null,"registeredEnvPolicy":[],"aspectIds":[],"envOwnPolicy":{},"loadFailures":[]})
}

impl Environments {
    pub(in crate::commands) fn for_builtin_services() -> Self {
        Self { builtin_services: true, ..Self::new() }
    }

    pub(in crate::commands) fn require_service(
        root: &Path,
        context: &Value,
        targets: &[Value],
    ) -> io::Result<()> {
        let core = core_ids()?;
        let aspects = root_aspects(context, &core);
        for target in targets {
            let component = component(root, context, target)?;
            if needs_facts(&component, &core, &aspects) && !supported(&component, &core, &aspects) {
                return Err(io::Error::other(
                    "component service requires custom environment lifecycle",
                ));
            }
        }
        Ok(())
    }

    pub(in crate::commands::status) fn require_write(
        &self,
        root: &Path,
        context: &Value,
    ) -> io::Result<()> {
        if self.builtin_services {
            Self::require_service(root, context, array(context.get("targets"), "service targets")?)
        } else {
            Self::require_native_write(root, context)
        }
    }
}

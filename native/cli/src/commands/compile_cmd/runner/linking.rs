mod host;
mod optional;
use crate::commands::{add, workspace_command::component_service::Loaded};
use bit_install::{
    config::WorkspaceConfig,
    links::{ComponentLinkOptions, link_components},
    model::{ComponentDependencies, WorkspaceComponent},
    workspace::Workspace,
};
use indexmap::IndexMap;
use std::{
    io,
    path::{Path, PathBuf},
};

pub(super) struct Links {
    components: Vec<WorkspaceComponent>,
    dependencies: IndexMap<String, ComponentDependencies>,
    roots: PathBuf,
    has_roots: bool,
}
impl Links {
    pub(super) fn prepare(root: &Path, loaded: &Loaded) -> io::Result<Self> {
        let config = WorkspaceConfig::load(root).map_err(io::Error::other)?;
        let core: Vec<String> = serde_json::from_str(include_str!(
            "../../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
        ))?;
        let workspace = Workspace::load(root, &config, &core).map_err(io::Error::other)?;
        let mut components: Vec<_> = workspace
            .active()
            .filter(|(_, component)| {
                loaded.progress.identities
                    .iter()
                    .any(|identity| matches_component_identity(identity, component))
            })
            .map(|(_, component)| component.clone())
            .collect();
        add::overlay_link_components(&mut components, loaded.captured())?;
        let mut dependencies =
            add::component_package_dependencies(loaded.captured())?.into_iter().collect();
        optional::apply(&components, loaded, &mut dependencies)?;
        Ok(Self {
            components,
            dependencies,
            roots: config.root_components_path(root),
            has_roots: config.dependency_resolver.has_root_components(),
        })
    }
    pub(super) fn dist_directories(
        &self,
        root: &Path,
        identities: &[String],
    ) -> io::Result<Vec<Vec<PathBuf>>> {
        identities
            .iter()
            .map(|identity| {
                let component = self.components
                    .iter()
                    .find(|component| matches_component_identity(identity, component))
                    .ok_or_else(|| io::Error::other("compiler component link identity"))?;
                bit_install::links::component_package_copies(root, component, &self.roots)
                    .map(|dirs| {
                        dirs.into_iter()
                            .map(|dir| dir.join("dist"))
                            .collect()
                    })
            })
            .collect()
    }
    pub(super) fn publish(&self, root: &Path) -> io::Result<()> {
        let options = ComponentLinkOptions {
            has_root_components: self.has_roots,
            root_components_dir: &self.roots,
            dependencies: &self.dependencies,
            cloud_domain: "bit.cloud",
            windows: cfg!(windows),
            aspect_env_ids: &[],
        };
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
        let result =
            runtime.block_on(link_components(root, &self.components, &host::Builtin, &options))?;
        if result.package_json_changed {
            add::invalidate_component_dependencies(root, &self.components)?;
        }
        Ok(())
    }
}

fn matches_component_identity(identity: &str, component: &WorkspaceComponent) -> bool {
    let target = component.id.to_string_without_version();
    let Some(bare) = identity
        .trim()
        .split('@')
        .next()
        .map(str::trim)
        .filter(|bare| !bare.is_empty())
    else {
        return false;
    };
    bare == target.trim() || (!bare.contains('/') && bare == component.id.name.trim())
}

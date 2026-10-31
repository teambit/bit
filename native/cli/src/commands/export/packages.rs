//! Native default package linking after scope publication, before bitmap promotion.
use bit_install::{
    links::{link_prepared_component, prepared_package_manifest},
    model::{ComponentDependencies, WorkspaceComponent},
};
use serde::Deserialize;
use serde_json::Value;
use std::{
    io,
    path::{Path, PathBuf},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Plan {
    component: WorkspaceComponent,
    dependencies: ComponentDependencies,
    props: Value,
    is_aspect: bool,
    target: Value,
    version_data: Value,
}

pub(super) fn link(root: &Path, staged: &Value) -> io::Result<()> {
    let plans = plans(staged)?;
    let root_components_dir: Option<PathBuf> = serde_json::from_value(
        staged
            .get("rootComponentsDir")
            .cloned()
            .unwrap_or(Value::Null),
    )?;
    let cloud_domain = staged["cloudDomain"].as_str().unwrap_or("bit.cloud");
    for plan in plans {
        let manifest = (!plan.component.has_package_json).then(|| {
            prepared_package_manifest(
                &plan.component,
                &plan.dependencies,
                &plan.props,
                cloud_domain,
                plan.is_aspect,
            )
        });
        link_prepared_component(
            root,
            &plan.component,
            manifest.as_ref(),
            root_components_dir.as_deref(),
        )?;
    }
    Ok(())
}

/// Check all captured configuration and manifest inputs before communication starts.
pub(super) fn validate(prepared: &Value) -> io::Result<()> {
    for plan in plans(prepared)? {
        let _ = prepared_package_manifest(
            &plan.component,
            &plan.dependencies,
            &plan.props,
            prepared["cloudDomain"].as_str().unwrap_or("bit.cloud"),
            plan.is_aspect,
        );
    }
    Ok(())
}

fn plans(receipt: &Value) -> io::Result<Vec<Plan>> {
    let mut plans: Vec<Plan> = serde_json::from_value(receipt["packageManifestPlans"].clone())?;
    for plan in &mut plans {
        plan.component.config = crate::commands::status::policy::export_package_config(
            &receipt["configurationContext"],
            &plan.target,
            &plan.version_data,
        )?;
        if plan.component.config
            .iter()
            .any(|(key, val)| {
                bit_install::config::aspect_id_without_version(key) == "teambit.pkg/pkg"
                    && val["packageJson"]["name"].is_string()
            })
        {
            plan.component.package_name = bit_install::workspace::component_package_name(
                &plan.component.id,
                plan.version_data["bindingPrefix"].as_str(),
                &plan.component.config,
            );
        }
    }
    Ok(plans)
}

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
    let root_components_dir = match staged.get("rootComponentsDir") {
        None | Some(Value::Null) => None,
        Some(Value::String(dir)) => {
            let trimmed = dir.trim();
            (!trimmed.is_empty()).then(|| PathBuf::from(trimmed))
        }
        Some(_) => return Err(io::Error::other("invalid rootComponentsDir")),
    };
    let cloud_domain = cloud_domain(staged);
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
    let cloud_domain = cloud_domain(prepared);
    for plan in plans(prepared)? {
        let _ = prepared_package_manifest(
            &plan.component,
            &plan.dependencies,
            &plan.props,
            cloud_domain,
            plan.is_aspect,
        );
    }
    Ok(())
}

fn cloud_domain(value: &Value) -> &str {
    value["cloudDomain"]
        .as_str()
        .map(str::trim)
        .filter(|domain| !domain.is_empty())
        .unwrap_or("bit.cloud")
}

fn plans(receipt: &Value) -> io::Result<Vec<Plan>> {
    let Some(raw_plans) = receipt
        .get("packageManifestPlans")
        .filter(|val| !val.is_null())
    else {
        return Ok(Vec::new());
    };
    let mut plans: Vec<Plan> = serde_json::from_value(raw_plans.clone())?;
    for plan in &mut plans {
        plan.component.config = crate::commands::status::policy::export_package_config(
            &receipt["configurationContext"],
            &plan.target,
            &plan.version_data,
        )?;
        if has_custom_pkg_name(&plan.component.config) {
            let binding_prefix = plan.version_data["bindingPrefix"]
                .as_str()
                .map(str::trim)
                .filter(|prefix| !prefix.is_empty());
            plan.component.package_name = bit_install::workspace::component_package_name(
                &plan.component.id,
                binding_prefix,
                &plan.component.config,
            );
        }
    }
    Ok(plans)
}

fn has_custom_pkg_name(config: &serde_json::Map<String, Value>) -> bool {
    config
        .iter()
        .any(|(key, val)| {
            bit_install::config::aspect_id_without_version(key) == "teambit.pkg/pkg"
                && val["packageJson"]["name"]
                    .as_str()
                    .is_some_and(|name| !name.trim().is_empty())
        })
}

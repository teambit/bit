//! One `markRemoveComps` `.bitmap` publication ([`Batch`]) for a selected component [`Plan`] batch.
use super::{DependencyComponent, Plan, Scope, invalid};
use crate::{component_remove::backup_bitmap, inspection};
use serde_json::Value;
use std::{fs, io, path::Path};

/// Prepared batch of component deletion [`Plan`]s sharing one final `.bitmap` image.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Batch {
    plans: Vec<Plan>,
    after: Vec<u8>,
}
impl Batch {
    /// Prepare individual deletion [`Plan`]s for `identities` and merge their `.bitmap` projections.
    pub fn prepare(
        root: &Path,
        identities: &[String],
        scope: &Scope,
        lane: bool,
        update_main: bool,
        components: Option<&[DependencyComponent]>,
    ) -> io::Result<Self> {
        if identities.len() > 4096 {
            return Err(invalid("component deletion batch limit"));
        }
        let facts = dependency_facts(components, identities);
        let mut plans = Vec::with_capacity(identities.len());
        for id in identities {
            plans.push(Plan::prepare_with(
                root,
                id,
                scope.clone(),
                lane,
                facts.as_deref(),
                update_main,
            )?);
        }
        let first = plans.first().ok_or_else(|| invalid("no components selected for deletion"))?;
        let before = crate::parse_jsonc(&first.bitmap.before)?;
        let mut bitmap = before.clone();
        for plan in &plans {
            if plan.bitmap.before != first.bitmap.before {
                return Err(invalid("component workspace changed before deletion"));
            }
            let mut projected = crate::parse_jsonc(&plan.bitmap.after)?;
            let rows = projected.as_object_mut().ok_or_else(|| invalid("component bitmap"))?;
            for (key, row) in std::mem::take(rows) {
                if row != before[&key] {
                    bitmap[key] = row;
                }
            }
        }
        Ok(Self { plans, after: inspection::render_workspace_bitmap(&bitmap)? })
    }
    #[must_use]
    #[inline]
    pub fn plans(&self) -> &[Plan] {
        &self.plans
    }
    #[inline]
    pub fn bitmap(&self) -> io::Result<Value> {
        crate::parse_jsonc(&self.plans[0].bitmap.before)
    }
    /// Use native captured package names, including configured package-name overrides.
    pub fn packages(&mut self, components: &[Value]) -> io::Result<()> {
        for plan in &mut self.plans {
            if plan.package.as_os_str().is_empty() {
                continue;
            }
            let full = plan.full_id.trim();
            let identity = full.rsplit_once('@').map_or(full, |(bare, _)| bare.trim());
            let Some(name) = matched_package_name(components, identity) else {
                continue;
            };
            let relative = Path::new(name);
            if name.contains('\\')
                || relative
                    .components()
                    .any(|part| !matches!(part, std::path::Component::Normal(_)))
            {
                return Err(invalid("component package path"));
            }
            let path = plan.root.join("node_modules").join(relative);
            crate::component_remove::validate_ancestors(
                &plan.root,
                path.strip_prefix(&plan.root).map_err(|_| invalid("component package path"))?,
            )?;
            crate::component_remove::validate_directory(&path)?;
            plan.package = path;
        }
        Ok(())
    }
    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        for plan in &self.plans {
            plan.validate(file_id)?;
        }
        for plan in &self.plans {
            if plan.entire && plan.package.try_exists()? {
                fs::remove_dir_all(&plan.package)?;
            }
        }
        let root = &self.plans[0].root;
        let _ = backup_bitmap(root, file_id, "delete");
        fs::write(root.join(".bitmap"), &self.after)?;
        crate::component_remove::remove_source_paths(
            self.plans.iter().filter_map(|plan| plan.files.as_deref()),
        )
    }
}

fn matched_package_name<'a>(components: &'a [Value], identity: &str) -> Option<&'a str> {
    components
        .iter()
        .find(|row| {
            row["identity"]
                .as_str()
                .or_else(|| row["id"].as_str())
                .map(|raw| {
                    let trimmed = raw.trim();
                    trimmed.rsplit_once('@').map_or(trimmed, |(bare, _)| bare.trim())
                })
                == Some(identity)
        })
        .and_then(|row| row["packageName"].as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
}

fn dependency_facts(
    components: Option<&[DependencyComponent]>,
    identities: &[String],
) -> Option<Vec<DependencyComponent>> {
    components.map(|components| {
        components
            .iter()
            .map(|component| {
                let bare = component.identity
                    .split('@')
                    .next()
                    .map(str::trim);
                let deleted = identities
                    .iter()
                    .any(|id| {
                        bare == Some(
                            id.trim()
                                .split('@')
                                .next()
                                .unwrap_or(id)
                                .trim(),
                        )
                    });
                DependencyComponent {
                    identity: component.identity.clone(),
                    package_name: component.package_name.clone(),
                    dependencies: if deleted { Vec::new() } else { component.dependencies.clone() },
                }
            })
            .collect::<Vec<_>>()
    })
}

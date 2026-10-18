//! Authoritative soft-delete preconditions and best-effort lane policy planning.
use super::{options::Options, policy};
use crate::commands::remove::preparation as selection;
use bit_object_import::component_delete::{Batch, DependencyComponent, Scope};
use std::{io, path::Path};
pub(super) struct Prepared {
    pub plan: Batch,
    pub policy: Option<policy::Policy>,
}
impl Prepared {
    pub(super) fn prepare(
        root: &Path,
        options: &Options<'_>,
        _preflight: bool,
    ) -> io::Result<Self> {
        let ids = selection::ids(root, options.pattern)?;
        Self::selected(root, options, &ids)
    }
    pub(super) fn selected(root: &Path, options: &Options<'_>, ids: &[String]) -> io::Result<Self> {
        let bitmap = selection::bitmap(root)?;
        validate(&bitmap, ids, options)?;
        let lane = !bitmap["_bit_lane"].is_null();
        let facts = None;
        let plan = Batch::prepare(root, ids, &options.scope, lane, options.update_main, facts)?;
        let pins = plan
            .plans()
            .iter()
            .filter_map(|plan| plan.pin())
            .collect::<Vec<_>>();
        let policy = policy::Policy::prepare_many(root, &pins).ok().flatten();
        Ok(Self { plan, policy })
    }
    pub(super) fn with_rows(
        root: &Path,
        options: &Options<'_>,
        ids: &[String],
        rows: &[serde_json::Value],
    ) -> io::Result<Self> {
        let bitmap = selection::bitmap(root)?;
        let lane = !bitmap["_bit_lane"].is_null();
        let facts = dependency_facts(rows)?;
        let mut plan =
            Batch::prepare(root, ids, &options.scope, lane, options.update_main, Some(&facts))?;
        plan.packages(&selection::facts(rows))?;
        let pins = plan
            .plans()
            .iter()
            .filter_map(|plan| plan.pin())
            .collect::<Vec<_>>();
        let policy = policy::Policy::prepare_many(root, &pins).ok().flatten();
        Ok(Self { plan, policy })
    }
    pub(super) fn validate(&self, root: &Path) -> io::Result<()> {
        if let Some(policy) = &self.policy {
            policy.validate(root)?;
        }
        Ok(())
    }
}
fn validate(bitmap: &serde_json::Value, ids: &[String], options: &Options<'_>) -> io::Result<()> {
    let lane = !bitmap["_bit_lane"].is_null();
    if lane && !options.lane && !options.update_main {
        return Err(invalid(
            "error: to delete components when on a lane, use either --lane or --update-main flag.\n--lane: delete the component from this lane only\n--update-main: delete the component from main after this lane is merged",
        ));
    }
    if !lane && options.update_main {
        return Err(invalid("--update-main is relevant only when on a lane"));
    }
    let new = ids
        .iter()
        .filter(|id| selection::row(bitmap, id).is_ok_and(|row| row["version"] == ""))
        .cloned()
        .collect::<Vec<_>>();
    if !new.is_empty() {
        return Err(invalid(&format!(
            "no need to delete the following new component(s), please remove them by \"bit remove\"\n{}",
            new.join("\n"),
        )));
    }
    if lane && !options.update_main && bitmap["_bit_lane"]["exported"] == false {
        return Err(invalid(
            r#"no need to delete components from an un-exported lane, you can remove them by running "bit remove""#,
        ));
    }
    if lane && !options.update_main && matches!(options.scope, Scope::Range(_)) {
        return Err(invalid(
            "--range is not needed when deleting components from a lane, unless --update-main is used",
        ));
    }
    Ok(())
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

fn dependency_facts(rows: &[serde_json::Value]) -> io::Result<Vec<DependencyComponent>> {
    rows.iter()
        .map(|row| {
            Ok(DependencyComponent {
                identity: row["componentIdentity"]
                    .as_str()
                    .ok_or_else(|| invalid("deletion graph identity"))?
                    .into(),
                package_name: row["packageName"]
                    .as_str()
                    .ok_or_else(|| invalid("deletion graph package"))?
                    .into(),
                dependencies: serde_json::from_value(row["componentDependencies"].clone())?,
            })
        })
        .collect()
}

pub(super) fn validate_options(root: &Path, options: &Options<'_>) -> io::Result<()> {
    validate(&selection::bitmap(root)?, &[], options)
}

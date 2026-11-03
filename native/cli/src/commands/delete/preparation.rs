//! Authoritative [`Prepared`] soft-delete [`Batch`] preconditions and best-effort lane [`policy`] planning.
//!
//! Validates `.bitmap` targets and constructs [`Batch`] plans for `bit delete`.
use super::{options::Options, policy};
use crate::commands::remove::preparation as selection;
use bit_object_import::component_delete::{Batch, DependencyComponent, Scope};
use std::{io, path::Path};
/// Validated soft-delete [`Batch`] plan paired with an optional `workspace.jsonc` [`policy::Policy`] edit.
pub(super) struct Prepared {
    pub plan: Batch,
    pub policy: Option<policy::Policy>,
}
impl Prepared {
    /// Resolves `options.pattern` ([`Options`]) against `.bitmap` via [`selection::ids`] and prepares the soft-delete [`Batch`].
    #[inline]
    pub(super) fn prepare(
        root: &Path,
        options: &Options<'_>,
        _preflight: bool,
    ) -> io::Result<Self> {
        let ids = selection::ids(root, options.pattern)?;
        Self::selected(root, options, &ids)
    }
    /// Prepares a [`Prepared`] soft-delete plan for pre-selected component `ids` via [`validate`] and [`prepare_policy`].
    pub(super) fn selected(root: &Path, options: &Options<'_>, ids: &[String]) -> io::Result<Self> {
        let bitmap = selection::bitmap(root)?;
        validate(&bitmap, ids, options)?;
        let lane = bit_workspace_config::truthy(&bitmap["_bit_lane"]);
        let facts = None;
        let plan = Batch::prepare(root, ids, &options.scope, lane, options.update_main, facts)
            .map_err(|error| io::Error::other(error.to_string()))?;
        let policy = prepare_policy(root, &plan);
        Ok(Self { plan, policy })
    }
    /// Prepares a [`Prepared`] soft-delete plan enriched with captured component dependency `rows` via [`dependency_facts`].
    pub(super) fn with_rows(
        root: &Path,
        options: &Options<'_>,
        ids: &[String],
        rows: &[serde_json::Value],
    ) -> io::Result<Self> {
        let bitmap = selection::bitmap(root)?;
        validate(&bitmap, ids, options)?;
        let lane = bit_workspace_config::truthy(&bitmap["_bit_lane"]);
        let facts = dependency_facts(rows)?;
        let mut plan =
            Batch::prepare(root, ids, &options.scope, lane, options.update_main, Some(&facts))
                .map_err(|error| io::Error::other(error.to_string()))?;
        plan.packages(&selection::facts(rows))?;
        let policy = prepare_policy(root, &plan);
        Ok(Self { plan, policy })
    }
    /// Validates any staged `workspace.jsonc` [`policy::Policy`] edit before committing the delete.
    #[inline]
    pub(super) fn validate(&self, root: &Path) -> io::Result<()> {
        if let Some(policy) = &self.policy {
            policy.validate(root)?;
        }
        Ok(())
    }
}
/// Builds an optional `workspace.jsonc` [`policy::Policy`] edit from any lane dependency pins in `plan`.
#[inline]
fn prepare_policy(root: &Path, plan: &Batch) -> Option<policy::Policy> {
    let pins = plan
        .plans()
        .iter()
        .filter_map(|item| item.pin())
        .collect::<Vec<_>>();
    policy::Policy::prepare_many(root, &pins).ok().flatten()
}
fn validate(bitmap: &serde_json::Value, ids: &[String], options: &Options<'_>) -> io::Result<()> {
    let lane = bit_workspace_config::truthy(&bitmap["_bit_lane"]);
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
        .filter(|id| selection::is_new(bitmap, id))
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
    if matches!(&options.scope, Scope::Snaps(snaps) if snaps.is_empty()) {
        return Err(invalid("please provide valid snap hashes for --snaps"));
    }
    Ok(())
}
#[inline]
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

fn dependency_facts(rows: &[serde_json::Value]) -> io::Result<Vec<DependencyComponent>> {
    rows.iter()
        .map(|row| {
            Ok(DependencyComponent {
                identity: row["componentIdentity"]
                    .as_str()
                    .map(str::trim)
                    .filter(|identity| !identity.is_empty())
                    .ok_or_else(|| invalid("deletion graph identity"))?
                    .into(),
                package_name: row["packageName"]
                    .as_str()
                    .map(str::trim)
                    .filter(|package| !package.is_empty())
                    .ok_or_else(|| invalid("deletion graph package"))?
                    .into(),
                dependencies: if row["componentDependencies"].is_null() {
                    Vec::new()
                } else {
                    serde_json::from_value(row["componentDependencies"].clone())?
                },
            })
        })
        .collect()
}

#[inline]
pub(super) fn validate_options(root: &Path, options: &Options<'_>) -> io::Result<()> {
    validate(&selection::bitmap(root)?, &[], options)
}

pub(in crate::commands::delete) fn validate_pre_prompt(
    root: &Path,
    lane_flag: bool,
    update_main: bool,
    hard: bool,
) -> io::Result<()> {
    let bitmap = selection::bitmap(root)?;
    let lane = bit_workspace_config::truthy(&bitmap["_bit_lane"]);
    if lane && !hard && !lane_flag && !update_main {
        return Err(invalid(
            "error: to delete components when on a lane, use either --lane or --update-main flag.\n--lane: delete the component from this lane only\n--update-main: delete the component from main after this lane is merged",
        ));
    }
    if !lane && update_main {
        return Err(invalid("--update-main is relevant only when on a lane"));
    }
    Ok(())
}

pub(in crate::commands::delete) fn can_prompt_user() -> bool {
    use std::io::IsTerminal;
    std::io::stdout().is_terminal()
        && std::io::stdin().is_terminal()
        && !["CI", "CLAUDECODE", "CLAUDE_CODE", "CURSOR_AGENT"]
            .iter()
            .any(|key| {
                std::env::var_os(key)
                    .is_some_and(|value| {
                        let text = value.to_string_lossy();
                        let trimmed = text.trim();
                        !trimmed.is_empty()
                            && trimmed != "0"
                            && !trimmed.eq_ignore_ascii_case("false")
                    })
            })
}

//! `bit deps remove` and `bit deps unset` implementation (`dependencies.main.runtime.ts`).

use super::{
    mutation::{BitmapMutation, apply_dep_resolver_config},
    parse::snap_to_semver,
    resolve::{ResolvedDep, WorkspaceDepsContext, split_pkg_to_name_and_ver},
};
use crate::commands::{
    color::Chalk,
    scope_set::{Failure, selection},
    set_peer::load_dep_resolver_config,
    workspace_command::format::Formatter,
};
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::{Value, json};

pub(super) type RemovedByComp = Vec<(String, Vec<String>)>;

pub(super) struct RemoveSpec<'a> {
    pub pattern: &'a str,
    pub packages: &'a [String],
    pub dev: bool,
    pub peer: bool,
    pub remove_only_if_exists: bool,
}

pub(super) fn prepare_remove(
    mut mutation: BitmapMutation,
    bitmap: &Bitmap,
    spec: &RemoveSpec<'_>,
    chalk: Chalk,
) -> Result<(BitmapMutation, RemovedByComp, bool), Failure> {
    let pattern = spec.pattern.trim();
    let matched = selection::resolve_pattern_entries(&mutation.root, bitmap, pattern, chalk)?;
    let ctx = WorkspaceDepsContext::load(&mutation.root)?;
    let dep_field = if spec.dev {
        "devDependencies"
    } else if spec.peer {
        "peerDependencies"
    } else {
        "dependencies"
    };
    let mut removed_by_comp = Vec::new();
    for entry in matched {
        let removed = remove_for_entry(&mut mutation, &ctx, entry, spec, dep_field)?;
        if !removed.is_empty() {
            removed_by_comp.push((selection::entry_full_id(entry), removed));
        }
    }
    mutation.reason = format!("deps-remove ({})", spec.pattern);
    Ok((mutation, removed_by_comp, spec.remove_only_if_exists))
}

fn remove_for_entry(
    mutation: &mut BitmapMutation,
    ctx: &WorkspaceDepsContext,
    entry: &BitmapEntry,
    spec: &RemoveSpec<'_>,
    dep_field: &str,
) -> Result<Vec<String>, Failure> {
    let current_cfg = load_dep_resolver_config(&mutation.root, &mutation.bitmap_val, entry)?
        .unwrap_or_else(|| json!({}));
    let mut new_cfg = current_cfg.clone();
    let component = ctx
        .find_workspace_component(entry)
        .ok_or_else(|| Failure::Declined("missing workspace component".into()))?;
    let (deps, missing) = ctx.collect_component_deps(entry, component, current_cfg.get("policy"));
    let lifecycle = match dep_field {
        "devDependencies" => "dev",
        "peerDependencies" => "peer",
        _ => "runtime",
    };
    let mut removed_for_comp = Vec::new();
    for raw_pkg in spec.packages {
        let Some((dep_name, dep_ver)) = match_pkg(raw_pkg, &deps, &missing, lifecycle)? else {
            continue;
        };
        if apply_pkg_removal(&mut new_cfg, dep_field, &dep_name, spec.remove_only_if_exists)? {
            removed_for_comp.push(format!("{dep_name}@{dep_ver}"));
        }
    }
    if !removed_for_comp.is_empty() {
        apply_dep_resolver_config(mutation, entry, new_cfg, false, false)?;
    }
    Ok(removed_for_comp)
}

fn match_pkg(
    raw_pkg: &str,
    deps: &[ResolvedDep],
    missing: &[String],
    lifecycle: &str,
) -> Result<Option<(String, String)>, Failure> {
    let (name, req_ver) = split_pkg_to_name_and_ver(raw_pkg);
    let name = name.trim();
    let req_ver = req_ver.map(str::trim);
    if name.is_empty() || req_ver.is_some_and(|ver| ver.contains('@')) {
        return Err(Failure::User(format!(
            r#"invalid package "{raw_pkg}" syntax, expected "package[@version]""#,
        )));
    }
    if let Some(dep) = deps
        .iter()
        .find(|dep| dep.lifecycle == lifecycle && dep_matches(dep, name, req_ver))
    {
        return Ok(Some((dep.package_name.clone(), dep.version.clone())));
    }
    if missing
        .iter()
        .any(|item| item.trim() == name)
    {
        let ver = req_ver
            .filter(|ver| !ver.is_empty())
            .unwrap_or("latest");
        return Ok(Some((name.to_owned(), ver.to_owned())));
    }
    Ok(None)
}

fn dep_matches(dep: &ResolvedDep, name: &str, req_ver: Option<&str>) -> bool {
    let name = name.trim();
    let name_ok = dep.package_name == name
        || dep.id == name
        || dep.comp_name.as_deref() == Some(name)
        || dep.comp_bare_id.as_deref() == Some(name);
    if !name_ok {
        return false;
    }
    req_ver.is_none_or(|ver| dep.version == ver || snap_to_semver(ver) == dep.version)
}

fn apply_pkg_removal(
    new_cfg: &mut Value,
    dep_field: &str,
    dep_name: &str,
    remove_only_if_exists: bool,
) -> Result<bool, Failure> {
    let dep_name = dep_name.trim();
    let cfg_obj = new_cfg
        .as_object_mut()
        .ok_or_else(|| Failure::Declined("dep-resolver config object".into()))?;
    let policy_obj = cfg_obj
        .entry("policy")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| Failure::Declined("dep-resolver policy object".into()))?;
    let field_obj = policy_obj
        .entry(dep_field)
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| Failure::Declined("dep-resolver policy field object".into()))?;
    if let Some(key) = field_obj
        .keys()
        .find(|key| key.trim() == dep_name)
        .cloned()
    {
        if field_obj[&key].as_str().map(str::trim) == Some("-") {
            return Ok(false);
        }
        field_obj.remove(&key);
        return Ok(true);
    }
    if remove_only_if_exists {
        return Ok(false);
    }
    field_obj.insert(dep_name.to_owned(), json!("-"));
    Ok(true)
}

pub(super) fn render_remove(
    formatter: &Formatter,
    removed: &[(String, Vec<String>)],
    unset: bool,
) -> String {
    if removed.is_empty() {
        let msg = if unset {
            "the specified component-pattern does not use the entered packages. nothing to unset"
        } else {
            "the specified component-pattern does not use the entered packages. nothing to remove"
        };
        return formatter.hint(msg);
    }
    let sections = removed
        .iter()
        .map(|(comp_id, pkgs)| {
            let items = pkgs
                .iter()
                .map(|pkg| formatter.item(pkg))
                .collect::<Vec<_>>();
            formatter.section(comp_id, "", &items)
        })
        .collect::<Vec<_>>();
    let summary =
        if unset { "successfully unset dependencies" } else { "successfully removed dependencies" };
    Formatter::join(&[formatter.success_summary(summary), sections.join("\n")])
}

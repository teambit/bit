//! Provider facts are retained while native sources, identities and configs are published.
//!
//! [`run`] executes [`Prepared`] rename [`Plan`] and [`Options`] with [`ProjectedLinker`] into a [`Report`].
use super::preparation::Prepared;
use crate::commands::{
    add::ProjectedLinker,
    color::Chalk,
    workspace_command::{self, results::Report},
};
use bit_object_import::component_rename::{Options, Plan};
use serde_json::{Value, json};
use std::{borrow::Cow, io, path::Path};

/// Executes a [`Prepared`] component rename plan and returns the formatted [`Report`].
pub(super) fn run(
    root: &Path,
    mut prepared: Prepared,
    options: &Options,
    linker: &mut ProjectedLinker,
    chalk: Chalk,
    output: &bit_install::output::Output,
) -> io::Result<Report> {
    hydrate(root, &mut prepared, options, linker)?;
    let source_package = prepared.facts["sourcePackage"]
        .as_str()
        .ok_or_else(|| io::Error::other("rename source package"))?
        .to_owned();
    if !prepared.plan.identity.exported {
        prepared.plan.finish_original(&workspace_command::file_id(), &source_package)?;
    }
    prepared.plan.begin(&workspace_command::file_id())?;
    target_load(root, &mut prepared, linker)?;
    if options.ast && !options.preserve && !prepared.plan.identity.exported {
        super::ast::transform(root, &mut prepared.plan, linker)?;
    }

    if options.refactor && !prepared.plan.identity.exported {
        refactor_load(root, &mut prepared, linker, output)?;
    }
    prepared.plan.apply_files()?;
    materialized(root, &prepared, linker)?;
    finish_exported(root, &mut prepared, options, linker, chalk, output, &source_package)?;
    if options.refactor && prepared.plan.identity.exported {
        exported_refactor(root, &mut prepared, linker, output)?;
    }
    prepared.plan.commit(&workspace_command::file_id())?;
    finish_link(root, &prepared, options, linker, chalk)?;
    output.stop();
    Ok(report(&prepared, chalk))
}

/// Synchronizes `prepared.facts` component file lists and overlay paths with `captured` [`Value`] rows.
fn refreshed_files(prepared: &mut Prepared, captured: &[serde_json::Value]) -> io::Result<()> {
    let components = prepared.facts["components"]
        .as_array_mut()
        .ok_or_else(|| io::Error::other("rename inventory"))?;
    for row in components {
        if let Some(current) = captured
            .iter()
            .find(|current| current["identity"] == row["identity"])
        {
            row["sourceOverlayRoot"] = current["sourceOverlayRoot"].clone();
            row["sourceOverlays"] = current["sourceOverlays"].clone();
            row["files"] = json!(
                current["files"]
                    .as_array()
                    .ok_or_else(|| io::Error::other("rename captured files"))?
                    .iter()
                    .map(relative_path)
                    .collect::<Vec<_>>()
            );
        }
    }
    Ok(())
}
/// Captures dependent components and rewrites their import specifiers during `bit rename --refactor`.
fn refactor_load(
    root: &Path,
    prepared: &mut Prepared,
    linker: &mut ProjectedLinker,
    output: &bit_install::output::Output,
) -> io::Result<()> {
    let identities = refactor_identities(prepared)?;
    output.status(&format!("loading {} component(s)", identities.len()));
    let bitmap = refactor_bitmap(&prepared.plan)?;
    let loaded = linker.capture_cached(root, &bitmap, &identities)?;
    print!("{}", linker.take_stdout());
    let source = prepared.facts["sourcePackage"]
        .as_str()
        .ok_or_else(|| io::Error::other("rename source package"))?;
    let target = prepared.facts["targetPackage"]
        .as_str()
        .ok_or_else(|| io::Error::other("rename target package"))?;
    prepared.plan.refactor_loaded(&loaded, (source, target))?;
    Ok(())
}

/// Formats the source component identity from `prepared` for rename reports.
#[inline]
fn source_display(prepared: &Prepared) -> String {
    let source = prepared.plan.identity.source.trim();
    if source.contains('@') {
        return source.to_owned();
    }
    prepared.facts["sourceVersion"]
        .as_str()
        .map(str::trim)
        .filter(|version| !version.is_empty())
        .map_or_else(|| source.to_owned(), |version| format!("{source}@{version}"))
}

pub(in crate::commands) fn hydrate(
    root: &Path,
    prepared: &mut Prepared,
    options: &Options,
    linker: &mut ProjectedLinker,
) -> io::Result<()> {
    let captured = linker.capture(
        root,
        &bit_object_import::parse_jsonc(&std::fs::read(root.join(".bitmap"))?)?,
        std::slice::from_ref(&prepared.plan.identity.source),
    )?;
    print!("{}", linker.take_stdout());
    let source = captured
        .iter()
        .find(|row| {
            row["identity"].as_str().map(str::trim) == Some(prepared.plan.identity.source.trim())
        })
        .ok_or_else(|| io::Error::other("rename source component capture missing"))?;
    prepared.facts["sourceExtensions"] = source["current"]["extensions"].clone();
    prepared.facts["sourceVersion"] = source["version"].clone();
    if prepared.plan.identity.exported {
        let config_res = linker.call(root, "renameSourceConfig", &json!({"component":source}));
        print!("{}", linker.take_stdout());
        prepared.facts["sourceConfigs"] = config_res?;
    }
    prepared.facts["preflight"] = json!(false);
    refreshed_files(prepared, &captured)?;
    prepared.plan.rehydrate(options, &prepared.facts)?;
    Ok(())
}

fn finish_exported(
    root: &Path,
    prepared: &mut Prepared,
    options: &Options,
    linker: &mut ProjectedLinker,
    chalk: Chalk,
    output: &bit_install::output::Output,
    source_package: &str,
) -> io::Result<()> {
    if prepared.plan.identity.exported {
        let added = vec![prepared.plan.identity.target.clone()];
        output.status(&format!("loading {} component(s)", added.len()));
        linker.link(root, prepared.plan.added_bitmap(), &added, false, chalk)?;
        print!("{}", linker.take_stdout());
        prepared.plan.publish_added(&workspace_command::file_id())?;
        linker.call(root, "renameTooling", &json!({"action":"onAdd","ids":added}))?;
        print!("{}", linker.take_stdout());
        if !options.deprecate {
            output.status("loading 1 component(s)");
        }
        prepared.plan.finish_original(&workspace_command::file_id(), source_package)?;
    }
    Ok(())
}

#[inline]
fn report(prepared: &Prepared, chalk: Chalk) -> Report {
    let message = format!(
        "renamed {} to {}",
        chalk.bold(&source_display(prepared)),
        chalk.bold(&prepared.plan.identity.target),
    );
    Report {
        data: workspace_command::format::Formatter::new(chalk).success_summary(&message),
        code: 0,
        details: None,
    }
}

#[inline]
fn relative_path(file: &serde_json::Value) -> serde_json::Value {
    if file.is_string() { file.clone() } else { file["relativePath"].clone() }
}

fn target_load(
    root: &Path,
    prepared: &mut Prepared,
    linker: &mut ProjectedLinker,
) -> io::Result<()> {
    if prepared.plan.identity.exported {
        return Ok(());
    }
    prepared.plan.publish_configuration(&workspace_command::file_id())?;
    let target_id = &prepared.plan.identity.target;
    let captured =
        linker.capture_cached(root, prepared.plan.added_bitmap(), std::slice::from_ref(target_id))?;
    print!("{}", linker.take_stdout());
    if let Some(target) = captured
        .iter()
        .find(|row| row["identity"] == *target_id)
    {
        let source = prepared.facts["sourcePackage"]
            .as_str()
            .ok_or_else(|| io::Error::other("rename source package"))?;
        let destination = prepared.facts["targetPackage"]
            .as_str()
            .ok_or_else(|| io::Error::other("rename target package"))?;
        prepared.plan.target_load(target, (source, destination))?;
    }
    Ok(())
}

#[inline]
fn materialized(root: &Path, prepared: &Prepared, linker: &mut ProjectedLinker) -> io::Result<()> {
    if !prepared.plan.identity.exported {
        linker.call(root, "identityMaterialized", &prepared.plan.materialized())?;
        print!("{}", linker.take_stdout());
    }
    Ok(())
}

fn refactor_identities(prepared: &Prepared) -> io::Result<Vec<String>> {
    let bitmap = refactor_bitmap(&prepared.plan)?;
    let identities = bitmap
        .as_object()
        .ok_or_else(|| io::Error::other("rename projected bitmap"))?
        .iter()
        .filter_map(|(key, row)| listed_identity(key, row))
        .collect::<Vec<_>>();
    Ok(identities)
}

#[inline]
fn flush_stdout(linker: &mut ProjectedLinker) {
    let stdout = linker.take_stdout();
    if !stdout.is_empty() {
        print!("{stdout}");
    }
}

fn exported_refactor(
    root: &Path,
    prepared: &mut Prepared,
    linker: &mut ProjectedLinker,
    output: &bit_install::output::Output,
) -> io::Result<()> {
    // RenamingMain reloads after adding/removing identities, before target get/list.
    prepared.plan.publish_configuration(&workspace_command::file_id())?;
    linker.forget_loaded();
    // Workspace.get(target) is singular; only getMany/list starts a loading summary.
    linker.capture(
        root,
        &prepared.plan.published_bitmap()?,
        std::slice::from_ref(&prepared.plan.identity.target),
    )?;
    flush_stdout(linker);
    refactor_load(root, prepared, linker, output)?;
    prepared.plan.apply_files()?;
    linker.call(root, "identityMaterialized", &prepared.plan.materialized())?;
    flush_stdout(linker);
    Ok(())
}

fn finish_link(
    root: &Path,
    prepared: &Prepared,
    options: &Options,
    linker: &mut ProjectedLinker,
    chalk: Chalk,
) -> io::Result<()> {
    let targets = vec![prepared.plan.identity.target.clone()];
    if prepared.plan.identity.exported && !options.refactor {
        linker.link(root, prepared.plan.bitmap(), &targets, false, chalk)?;
    } else {
        linker.link_retained(root, prepared.plan.bitmap(), &targets, false, chalk)?;
    }
    flush_stdout(linker);
    linker.call(root, "renameTooling", &json!({"action":"compile","ids":targets}))?;
    flush_stdout(linker);
    Ok(())
}

#[inline]
fn refactor_bitmap(plan: &Plan) -> io::Result<Cow<'_, Value>> {
    if plan.identity.exported {
        plan.published_bitmap().map(Cow::Owned)
    } else {
        Ok(Cow::Borrowed(plan.added_bitmap()))
    }
}
#[inline]
fn listed_identity(key: &str, row: &Value) -> Option<String> {
    if key.starts_with('$') || key == "_bit_lane" || key == "version" || !row.is_object() {
        return None;
    }
    let removed =
        crate::commands::update_cmd::aspect_entry(&row["config"], "teambit.component/remove")
            .is_some_and(|(_, val)| val["removed"] == true);
    if removed || row["isAvailableOnCurrentLane"] == false {
        return None;
    }
    row["rootDir"].as_str()?;
    let (scope, name) = crate::commands::update_cmd::bitmap_row_scope_and_name(key, row);
    if scope.is_empty() || name.is_empty() {
        return None;
    }
    Some(format!("{scope}/{name}"))
}

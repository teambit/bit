//! Provider facts are retained while native sources, identities and configs are published.
use super::preparation::Prepared;
use crate::commands::{
    add::ProjectedLinker,
    color::Chalk,
    workspace_command::{self, results::Report},
};
use bit_object_import::component_rename::{Options, Plan};
use serde_json::{Value, json};
use std::{borrow::Cow, io, path::Path};

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

fn source_display(prepared: &Prepared) -> String {
    let source = &prepared.plan.identity.source;
    prepared.facts["sourceVersion"]
        .as_str()
        .filter(|version| !version.is_empty())
        .map_or_else(|| source.clone(), |version| format!("{source}@{version}"))
}

fn hydrate(
    root: &Path,
    prepared: &mut Prepared,
    options: &Options,
    linker: &mut ProjectedLinker,
) -> io::Result<()> {
    let ids = vec![prepared.plan.identity.source.clone()];
    let captured = linker.capture(
        root,
        &bit_object_import::parse_jsonc(&std::fs::read(root.join(".bitmap"))?)?,
        &ids,
    )?;
    print!("{}", linker.take_stdout());
    if let Some(source) = captured
        .iter()
        .find(|row| row["identity"] == prepared.plan.identity.source)
    {
        prepared.facts["sourceExtensions"] = source["current"]["extensions"].clone();
        prepared.facts["sourceVersion"] = source["version"].clone();
        if prepared.plan.identity.exported {
            prepared.facts["sourceConfigs"] =
                linker.call(root, "renameSourceConfig", &json!({"component":source}))?;
            print!("{}", linker.take_stdout());
        }
    }
    prepared.facts["preflight"] = json!(false);
    refreshed_files(prepared, &captured)?;
    prepared.plan = Plan::prepare(root, options, &prepared.facts)?;
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
    let identities = vec![prepared.plan.identity.target.clone()];
    let captured = linker.capture_cached(root, prepared.plan.added_bitmap(), &identities)?;
    print!("{}", linker.take_stdout());
    if let Some(target) = captured
        .iter()
        .find(|row| row["identity"] == identities[0])
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

fn exported_refactor(
    root: &Path,
    prepared: &mut Prepared,
    linker: &mut ProjectedLinker,
    output: &bit_install::output::Output,
) -> io::Result<()> {
    // RenamingMain reloads after adding/removing identities, before target get/list.
    prepared.plan.publish_configuration(&workspace_command::file_id())?;
    let target = vec![prepared.plan.identity.target.clone()];
    linker.forget_loaded();
    // Workspace.get(target) is singular; only getMany/list starts a loading summary.
    linker.capture(root, &prepared.plan.published_bitmap()?, &target)?;
    print!("{}", linker.take_stdout());
    refactor_load(root, prepared, linker, output)?;
    prepared.plan.apply_files()?;
    linker.call(root, "identityMaterialized", &prepared.plan.materialized())?;
    print!("{}", linker.take_stdout());
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
    print!("{}", linker.take_stdout());
    linker.call(root, "renameTooling", &json!({"action":"compile","ids":targets}))?;
    print!("{}", linker.take_stdout());
    Ok(())
}

fn refactor_bitmap(plan: &Plan) -> io::Result<Cow<'_, Value>> {
    if plan.identity.exported {
        plan.published_bitmap().map(Cow::Owned)
    } else {
        Ok(Cow::Borrowed(plan.added_bitmap()))
    }
}
fn listed_identity(key: &str, row: &Value) -> Option<String> {
    if row["config"]["teambit.component/remove"]["removed"] == true
        || row["isAvailableOnCurrentLane"] == false
    {
        return None;
    }
    let name = row["name"].as_str().unwrap_or(key);
    let scope = row["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .or_else(|| row["defaultScope"].as_str())?;
    row["rootDir"].as_str()?;
    Some(format!("{scope}/{name}"))
}

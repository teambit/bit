//! Built-in diagnosis dispatch, preserving published per-check result shapes.
use super::{catalog::Diagnosis, context::Context, store, vendors};
use serde_json::{Value, json};
use std::{fs, io, path::Path, process::Command};
pub(super) fn examine(diagnosis: &Diagnosis, context: &Context) -> io::Result<Value> {
    match diagnosis.name {
        "validate git exec" | "validate npm exec" | "validate yarn exec" => {
            Ok(vendors::examine(diagnosis, context.setting("git_path", "git")))
        }
        "validate scope objects" => store::heads(diagnosis, context.scope.as_deref()),
        "check orphan refs" => store::orphans(diagnosis, workspace_scope(context)?),
        "check environment symlinks" => environments(diagnosis, workspace_scope(context)?),
        "validate bit version" => latest(diagnosis, context),
        _ => workspace(diagnosis, context),
    }
}
fn workspace_scope(context: &Context) -> io::Result<&Path> {
    if !context.root.join(".bitmap").exists() {
        return Err(io::Error::other(
            "workspace not found. to initiate a new workspace, please use `bit init`",
        ));
    }
    context.scope.as_deref().ok_or_else(|| io::Error::other("workspace scope not found"))
}
fn workspace(diagnosis: &Diagnosis, context: &Context) -> io::Result<Value> {
    workspace_scope(context)?;
    let valid = super::context::optional_json(&context.root.join("workspace.jsonc")).is_ok();
    let bare = if valid { json!({"valid":true}) } else { json!({"valid":false,"data":{}}) };
    Ok(diagnosis.result(bare,"invalid workspace.jsonc: undefined is not a valid JSON file.","manually fix the workspace.jsonc or consider running bit init --reset to recreate the file"))
}
fn latest(diagnosis: &Diagnosis, context: &Context) -> io::Result<Value> {
    let latest = latest_fact(context)?;
    let package =
        context.cli.bit_dir.as_ref().ok_or_else(|| io::Error::other("missing Bit package"))?;
    let package: Value = bit_object_import::parse_jsonc(&fs::read(package.join("package.json"))?)
        .map_err(io::Error::other)?;
    let current = package["version"].as_str().map_or("", str::trim);
    let latest_str = latest
        .as_str()
        .map(str::trim)
        .filter(|ver| !ver.is_empty());
    let newer = latest_str.is_some_and(|latest| compare(current, latest));
    let bare = if let Some(latest_ver) = latest_str {
        if newer {
            json!({"valid":false,"data":{"latestVersion":latest_ver,"currentVersion":current}})
        } else {
            json!({"valid":true})
        }
    } else {
        json!({"valid":false,"data":{"latestVersion":null}})
    };
    let symptoms = latest_str.map_or_else(
        || "could not fetch bit latest version".into(),
        |latest_ver| {
            format!(
                "bit is not up to date.\n  your version: {current}\n  latest version: {latest_ver}",
            )
        },
    );
    Ok(diagnosis.result(
        bare,
        &symptoms,
        if latest_str.is_none() {
            "please make sure you have an internet connection"
        } else {
            "please upgrade your bit version (bvm upgrade)"
        },
    ))
}
fn latest_fact(context: &Context) -> io::Result<Value> {
    let package =
        context.cli.bit_dir.as_ref().ok_or_else(|| io::Error::other("missing Bit package"))?;
    // Only the published BVM registry lookup is JavaScript. No workspace data is sent.
    let output=Command::new(&context.cli.node).arg("-e").arg("const {createRequire}=require('module');const r=createRequire(process.argv[1]+'/package.json');r('@teambit/bvm.list').listRemote({limit:1}).then(x=>process.stdout.write(JSON.stringify(x.entries[0].version))).catch(e=>{console.error(e.message);process.exitCode=1})").arg(package).output()?;
    if !output.status.success() {
        return Err(io::Error::other(String::from_utf8_lossy(&output.stderr).trim().to_owned()));
    }
    serde_json::from_slice(&output.stdout).map_err(io::Error::other)
}
fn compare(current: &str, latest: &str) -> bool {
    match (
        clean_version(current).parse::<node_semver::Version>(),
        clean_version(latest).parse::<node_semver::Version>(),
    ) {
        (Ok(current), Ok(latest)) => current < latest,
        _ => false,
    }
}
fn clean_version(ver: &str) -> &str {
    ver.trim()
        .trim_matches(['"', '\''])
        .trim()
        .trim_start_matches(['v', 'V'])
        .trim()
}
fn environments(diagnosis: &Diagnosis, scope: &Path) -> io::Result<Value> {
    let mut broken = Vec::new();
    visit(&scope.join("components"), &mut broken)?;
    let symptoms = format!(
        "the following symlinks points to non-existing paths\n{}",
        broken
            .iter()
            .map(|row| format!(
                r#"symlink path: "{}", broken link: "{}""#,
                row["symlinkPath"].as_str().unwrap_or_default(),
                row["brokePath"].as_str().unwrap_or_default()
            ))
            .collect::<Vec<_>>()
            .join("\n"),
    );
    let mut paths = Vec::new();
    for row in &broken {
        if !paths.contains(&row["pathToDelete"]) {
            paths.push(row["pathToDelete"].clone());
        }
    }
    let treatment = format!(
        "please delete the following paths:\n{}",
        paths
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join("\n"),
    );
    Ok(diagnosis.result(
        json!({"valid":broken.is_empty(),"data":{"brokenSymlinks":broken}}),
        &symptoms,
        &treatment,
    ))
}
fn visit(directory: &Path, broken: &mut Vec<Value>) -> io::Result<()> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            visit(&path, broken)?;
        } else if file_type.is_symlink()
            && !path.exists()
            && let Ok(link) = fs::read_link(&path)
        {
            let marker = Path::new("node_modules").join("@bit");
            if let Some((prefix, _)) = path
                .to_string_lossy()
                .split_once(marker.to_string_lossy().as_ref())
            {
                broken.push(json!({"symlinkPath":path,"brokePath":link,"pathToDelete":prefix.trim_end_matches(std::path::MAIN_SEPARATOR)}));
            }
        }
    }
    Ok(())
}

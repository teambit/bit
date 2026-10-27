use super::{Compiled, Diagnostic, Emitted, tool};
use crate::commands::workspace_command::component_service::Component;
use serde_json::{Value, json};
use std::{
    io,
    path::{Path, PathBuf},
};

pub(super) fn prepare(
    root: &Path,
    components: &[Component],
    identities: &[String],
    directories: &[Vec<PathBuf>],
) -> io::Result<Vec<Compiled>> {
    let files: Vec<_> = components
        .iter()
        .flat_map(|component| {
            component.files
                .iter()
                .map(|file| {
                    let mut file = file.clone();
                    file["directory"] = json!(root.join(&component.directory));
                    file
                })
        })
        .collect();
    let results = if files.is_empty() { Vec::new() } else { tool::compile(&files)? };
    let mut offset = 0;
    let mut compiled = Vec::new();
    for ((component, identity), directories) in components
        .iter()
        .zip(identities)
        .zip(directories)
    {
        let end = offset + component.files.len();
        compiled.push(compile(
            &files[offset..end],
            &results[offset..end],
            identity.clone(),
            directories,
        )?);
        offset = end;
    }
    Ok(compiled)
}
fn compile(
    files: &[Value],
    result: &[Value],
    identity: String,
    directories: &[PathBuf],
) -> io::Result<Compiled> {
    let mut compiled = Compiled { identity, files: Vec::new(), errors: Vec::new() };
    let mut ordered: Vec<_> = files.iter().zip(result).collect();
    ordered.sort_by_key(|(_, row)| row["copied"] != true);
    for (source, row) in ordered {
        if let Some(error) = row["error"].as_str() {
            compiled.errors.push(Diagnostic {
                path: Path::new(
                    source["absolutePath"]
                        .as_str()
                        .ok_or_else(|| io::Error::other("compiler source path"))?,
                )
                .to_path_buf(),
                message: error.to_owned(),
            });
        }
        append(&mut compiled, row, directories)?;
    }
    Ok(compiled)
}
fn append(
    compiled: &mut Compiled,
    row: &Value,
    directories: &[std::path::PathBuf],
) -> io::Result<()> {
    let files =
        row["files"].as_array().ok_or_else(|| io::Error::other("compiler emitted files"))?;
    for directory in directories {
        for file in files {
            let relative = file["outputPath"]
                .as_str()
                .ok_or_else(|| io::Error::other("compiler output path"))?;
            if Path::new(relative)
                .components()
                .any(|part| !matches!(part, std::path::Component::Normal(_)))
            {
                return Err(io::Error::other("compiler output relative path"));
            }
            let content = file["outputText"]
                .as_str()
                .ok_or_else(|| io::Error::other("compiler emitted content"))?;
            compiled.files.push(Emitted {
                path: directory.join(relative),
                content: content.to_owned(),
            });
        }
    }
    Ok(())
}

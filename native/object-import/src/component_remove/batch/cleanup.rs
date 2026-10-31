//! The retained package, workspace-aspect and staged-configuration cleanup.
mod configuration;
mod pending;
use super::super::{Selected, invalid};
use configuration::Configuration;
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};
pub(in crate::component_remove) struct Cleanup {
    manifest: Option<Change>,
    configuration: Option<Configuration>,
    staged: Option<Change>,
    pending: Option<Change>,
}
pub(super) struct Change {
    pub(super) path: PathBuf,
    pub(super) before: Vec<u8>,
    pub(super) after: Vec<u8>,
}
impl Change {
    pub(in crate::component_remove) fn validate(&self) -> io::Result<()> {
        if !fs::symlink_metadata(&self.path)?.file_type().is_file()
            || fs::read(&self.path)? != self.before
        {
            return Err(invalid("stash removal configuration changed"));
        }
        Ok(())
    }
    pub(super) fn write(&self) -> io::Result<()> {
        fs::write(&self.path, &self.after)
    }
}
impl Cleanup {
    pub(in crate::component_remove) fn prepare(
        root: &Path,
        bitmap: &Value,
        selected: &[Selected],
        components: &[Value],
    ) -> io::Result<Self> {
        let identities: Vec<_> = selected
            .iter()
            .map(|row| row.identity.as_str())
            .collect();
        let packages: Vec<_> = selected
            .iter()
            .filter(|row| !row.package.as_os_str().is_empty())
            .map(|row| package_name(root, row, components))
            .collect::<io::Result<_>>()?;
        Ok(Self {
            manifest: manifest(root, &packages)?,
            configuration: Configuration::prepare(root, &identities)?,
            staged: staged(root, bitmap, &identities)?,
            pending: pending::prepare(root, selected)?,
        })
    }
    pub(in crate::component_remove) fn validate(&self) -> io::Result<()> {
        for change in [self.manifest.as_ref(), self.staged.as_ref(), self.pending.as_ref()]
            .into_iter()
            .flatten()
        {
            change.validate()?;
        }
        if let Some(configuration) = &self.configuration {
            configuration.validate()?;
        }
        Ok(())
    }
    pub(in crate::component_remove) fn scope(&self) -> io::Result<()> {
        if let Some(change) = &self.pending {
            change.write()?;
        }
        Ok(())
    }
    pub(in crate::component_remove) fn manifest(&self) -> io::Result<()> {
        if let Some(change) = &self.manifest {
            change.write()?;
        }
        Ok(())
    }
    pub(in crate::component_remove) fn configuration(
        &self,
        root: &Path,
        file_id: &str,
    ) -> io::Result<()> {
        if let Some(configuration) = &self.configuration {
            configuration.write(root, file_id)?;
        }
        if let Some(change) = &self.staged {
            change.write()?;
        }
        Ok(())
    }
}
fn package_name(root: &Path, row: &Selected, components: &[Value]) -> io::Result<String> {
    if let Some(name) = components
        .iter()
        .find(|component| {
            component["identity"].as_str().map(str::trim) == Some(row.identity.trim())
        })
        .and_then(|component| component["packageName"].as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
    {
        return Ok(name.to_owned());
    }
    Ok(row.package
        .strip_prefix(root.join("node_modules"))
        .map_err(|_| invalid("stash component package path"))?
        .to_str()
        .ok_or_else(|| invalid("stash component package name"))?
        .replace('\\', "/"))
}
fn manifest(root: &Path, packages: &[String]) -> io::Result<Option<Change>> {
    let path = root.join("package.json");
    let Some(before) = read_optional(&path)? else {
        return Ok(None);
    };
    let mut value: Value = crate::parse_jsonc(&before)?;
    let Some(dependencies) = value.get_mut("dependencies") else {
        return Ok(None);
    };
    let dependencies =
        dependencies.as_object_mut().ok_or_else(|| invalid("workspace package dependencies"))?;
    for package in packages {
        dependencies.shift_remove(package);
    }
    let text = std::str::from_utf8(&before).map_err(io::Error::other)?;
    let after = bit_workspace_config::package_json::stringify_package(
        &value,
        &bit_workspace_config::package_json::detect_indent(text),
        bit_workspace_config::package_json::detect_newline(text),
    )?
    .into_bytes();
    Ok(Some(Change { path, before, after }))
}
fn staged(root: &Path, bitmap: &Value, identities: &[&str]) -> io::Result<Option<Change>> {
    let path = staged_path(root, bitmap)?;
    let Some(before) = read_optional(&path)? else {
        return Ok(None);
    };
    let mut value: Value = crate::parse_jsonc(&before)?;
    let rows = value.as_array_mut().ok_or_else(|| invalid("stash staged configuration"))?;
    let length = rows.len();
    rows.retain(|row| {
        let (row_scope, row_name) = crate::component_remove::lane::lane_id_parts(&row["id"]);
        let scoped = format!("{row_scope}/{row_name}");
        !identities
            .iter()
            .any(|identity| {
                *identity == scoped
                    || (row_scope.is_empty()
                        && identity.split_once('/').map(|(_, nm)| nm) == Some(row_name))
            })
    });
    if rows.len() == length {
        return Ok(None);
    }
    Ok(Some(Change {
        path,
        before,
        after: serde_json::to_vec_pretty(&value).map_err(io::Error::other)?,
    }))
}
pub(super) fn read_optional(path: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() && metadata.len() <= 32 * 1024 * 1024 => {
            Ok(Some(crate::read_budget::Budget::new(32 * 1024 * 1024).read(fs::File::open(path)?)?))
        }
        Ok(_) => Err(invalid("stash configuration is not a regular file")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn staged_path(root: &Path, bitmap: &Value) -> io::Result<PathBuf> {
    let base = crate::scope_path(root).join("staged-config");
    if let Some(id) = bitmap
        .get("_bit_lane")
        .and_then(|lane| lane.get("id"))
    {
        let (scope, name) = crate::component_remove::lane::lane_id_parts(id);
        if [scope, name]
            .iter()
            .any(|part| {
                part.is_empty() || part.contains(['/', '\\']) || matches!(*part, "." | "..")
            })
        {
            return Err(invalid("stash staged lane path"));
        }
        Ok(base
            .join(scope)
            .join(format!("{name}.json")))
    } else {
        Ok(base.join("main.json"))
    }
}

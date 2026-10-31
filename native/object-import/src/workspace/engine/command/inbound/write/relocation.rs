//! `ComponentWriterMain.relocateOccupiedDirs`: filesystem-aware numbered targets.
#[cfg(test)]
mod tests;
use crate::component_tracking::observe::Observed;
use serde_json::{Map, Value};
use std::{collections::HashSet, fs, io, path::Path};

#[derive(Default)]
pub(super) struct Retained {
    observed: Observed,
    warnings: Vec<String>,
}
impl Retained {
    pub(super) fn validate(&self) -> io::Result<()> {
        self.observed.validate()
    }

    pub(super) fn avoid_tracked(
        &mut self,
        root: &Path,
        directory: String,
        target: &super::Target,
        rows: &Map<String, Value>,
    ) -> io::Result<String> {
        let Some((key, row)) = rows
            .iter()
            .find(|(_, row)| trimmed_str(&row["rootDir"]) == Some(directory.as_str()))
        else {
            return Ok(directory);
        };
        let scope = target.scope.as_deref().ok_or_else(|| super::invalid("inbound scope"))?;
        let Some((owner, _)) = scope.split_once('.') else { return Ok(directory) };
        if directory.starts_with(&format!("{owner}/")) {
            return Ok(directory);
        }
        let candidate = format!("{owner}/{directory}");
        let nested = rows
            .values()
            .filter_map(|row| trimmed_str(&row["rootDir"]))
            .any(|tracked| {
                tracked.starts_with(&format!("{candidate}/"))
                    || candidate.starts_with(&format!("{tracked}/"))
            });
        if nested || unavailable(root, &candidate, rows, &mut self.observed)?.is_some() {
            return Ok(directory);
        }
        let used_scope = trimmed_str(&row["scope"])
            .ok_or_else(|| super::invalid("inbound owner collision with unscoped component"))?;
        let version =
            trimmed_str(&row["version"]).map_or(String::new(), |version| format!("@{version}"));
        let (_, used_name) = crate::reset_lane::bitmap::row_identity(key, row);
        self.warnings.push(format!(
            r#""{directory}" is already used by {}/{}{version}, importing {scope}/{} into "{candidate}" instead"#,
            used_scope, used_name, target.name,
        ));
        Ok(candidate)
    }
}

pub(super) fn prepare_into(
    root: &Path,
    directories: &mut [String],
    rows: &Map<String, Value>,
    retained: &mut Retained,
) -> io::Result<()> {
    let mut taken: HashSet<String> = rows
        .values()
        .filter_map(|row| trimmed_str(&row["rootDir"]).map(str::to_owned))
        .collect();
    taken.extend(directories.iter().cloned());
    for directory in directories {
        if directory == "." {
            continue;
        }
        let Some(reason) = unavailable(root, directory, rows, &mut retained.observed)? else {
            continue;
        };
        let mut number: usize = 1;
        let mut candidate = format!("{directory}_{number}");
        while taken.contains(&candidate)
            || unavailable(root, &candidate, rows, &mut retained.observed)?.is_some()
        {
            number = number.saturating_add(1);
            candidate = format!("{directory}_{number}");
            if number > 65536 {
                return Err(super::invalid("inbound directory relocation limit"));
            }
        }
        retained.warnings.push(format!(
            r#"unable to import into "{directory}" ({reason}), importing into "{candidate}" instead"#,
        ));
        directory.clone_from(&candidate);
        taken.insert(candidate);
    }
    Ok(())
}

fn trimmed_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn unavailable(
    root: &Path,
    directory: &str,
    rows: &Map<String, Value>,
    observed: &mut Observed,
) -> io::Result<Option<String>> {
    if let Some((key, row)) = rows
        .iter()
        .find(|(_, row)| trimmed_str(&row["rootDir"]) == Some(directory))
    {
        let (row_scope, row_name) = crate::reset_lane::bitmap::row_identity(key, row);
        return Ok(Some(format!(
            "it is already used by {}/{}@{}",
            row_scope.unwrap_or_default(),
            row_name,
            trimmed_str(&row["version"]).unwrap_or_default(),
        )));
    }
    let path = root.join(directory);
    retain_parents(root, &path, observed)?;
    match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            observed.read(&path)?;
            Ok(None)
        }
        Ok(metadata) if metadata.is_dir() => {
            Ok((!observed.directory(&path)?.is_empty()).then(|| {
                "the directory is not empty".into()
            }))
        }
        Ok(_) => {
            observed.read(&path)?;
            Ok(Some("it is a file".into()))
        }
        Err(error) => Err(error),
    }
}

fn retain_parents(root: &Path, path: &Path, observed: &mut Observed) -> io::Result<()> {
    let mut parent = path.parent().ok_or_else(|| super::invalid("inbound destination parent"))?;
    loop {
        if !parent.starts_with(root) {
            return Err(super::invalid("inbound destination outside workspace"));
        }
        match fs::symlink_metadata(parent) {
            Ok(_) => return observed.ancestors(root, parent),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                observed.read(parent)?;
                parent = parent
                    .parent()
                    .ok_or_else(|| super::invalid("inbound destination ancestor"))?;
            }
            Err(error) => return Err(error),
        }
    }
}

impl super::Prepared {
    pub(in super::super) fn directory_warnings(&self) -> &[String] {
        &self.changes.relocation.warnings
    }
}

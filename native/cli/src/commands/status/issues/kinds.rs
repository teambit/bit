//! Native issue kinds and their released class metadata.

use super::{
    SPACE, array, decline, detected,
    format::{join, list_or_text},
    text,
};
use serde_json::{Value, json};
use std::io;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Issue {
    MissingManual,
    MissingPackages,
    MissingDependencies,
    ImportFromDirectory,
    MissingLinks,
    MissingDists,
    Duplicate,
    Circular,
    RemovedDependencies,
    NonLoadedEnv,
    MultipleEnvs,
    RemovedEnv,
    DeprecatedDependencies,
    PinnedDependencies,
    Detected(detected::Issue),
}

impl Issue {
    pub(super) fn parse(name: &str) -> io::Result<Self> {
        let name = name.trim();
        Ok(match name {
            "MissingManuallyConfiguredPackages" => Self::MissingManual,
            "MissingPackagesDependenciesOnFs" => Self::MissingPackages,
            "MissingDependenciesOnFs" => Self::MissingDependencies,
            "ImportFromDirectory" => Self::ImportFromDirectory,
            "MissingLinksFromNodeModulesToSrc" => Self::MissingLinks,
            "MissingDists" => Self::MissingDists,
            "DuplicateComponentAndPackage" => Self::Duplicate,
            "CircularDependencies" => Self::Circular,
            "RemovedDependencies" => Self::RemovedDependencies,
            "NonLoadedEnv" => Self::NonLoadedEnv,
            "MultipleEnvs" => Self::MultipleEnvs,
            "RemovedEnv" => Self::RemovedEnv,
            "DeprecatedDependencies" => Self::DeprecatedDependencies,
            "PinnedDependencies" => Self::PinnedDependencies,
            _ => Self::Detected(detected::Issue::parse(name)?),
        })
    }

    /// `type`, `description`, `solution` and `isTagBlocker` of the issue class.
    pub(super) const fn class(self) -> (&'static str, &'static str, &'static str, bool) {
        match self {
            Self::MissingPackages => (
                "MissingPackagesDependenciesOnFs",
                "missing packages or links from node_modules to the source",
                r#"run "bit install --add-missing-deps" to fix both issues"#,
                true,
            ),
            Self::MissingDependencies => (
                "MissingDependenciesOnFs",
                "non-existing dependency files",
                "make sure all files exists on your workspace",
                true,
            ),
            Self::ImportFromDirectory => (
                "ImportFromDirectory",
                "relative import from a directory",
                "change the import statement to a specific file",
                false,
            ),
            Self::Detected(kind) => kind.class(),
            _ => self.legacy_class(),
        }
    }

    const fn legacy_class(self) -> (&'static str, &'static str, &'static str, bool) {
        match self {
            Self::MissingManual => (
                "MissingManuallyConfiguredPackages",
                "missing packages that were manually set",
                r#"run "bit install""#,
                true,
            ),
            Self::MissingLinks => (
                "MissingLinksFromNodeModulesToSrc",
                "missing links from node_modules to source",
                r#"run "bit link""#,
                false,
            ),
            Self::MissingDists => ("MissingDists", "missing dists", r#"run "bit compile""#, false),
            Self::Duplicate => (
                "DuplicateComponentAndPackage",
                "tracked component added as a package",
                "either remove the package from the workspace.jsonc (bit uninstall) or remove the component (bit remove)",
                true,
            ),
            Self::Circular => (
                "CircularDependencies",
                "circular dependencies",
                "run `bit deps circular` to get the component-ids participating in the circular",
                true,
            ),
            Self::RemovedDependencies => (
                "RemovedDependencies",
                "dependencies used in the code were deleted",
                r#"if the dependencies are no longer needed, remove them from the code. otherwise, to get it installed from main run "bit install <missing dep>". to undo the delete, run "bit recover""#,
                true,
            ),
            Self::NonLoadedEnv | Self::MultipleEnvs | Self::RemovedEnv => self.environment_class(),
            Self::DeprecatedDependencies => Self::deprecated_class(),
            Self::PinnedDependencies => Self::pinned_class(),
            _ => unreachable!(),
        }
    }

    const fn deprecated_class() -> (&'static str, &'static str, &'static str, bool) {
        (
            "DeprecatedDependencies",
            "dependencies used in the code were deprecated",
            "replace them with alternative dependencies. or remove them if not needed anymore",
            false,
        )
    }

    const fn pinned_class() -> (&'static str, &'static str, &'static str, bool) {
        (
            "PinnedDependencies",
            r#"dependencies on workspace components with a version set by config ("bit deps set", variants or env), not the workspace version"#,
            r#"to use the workspace version, remove the version from the config, e.g. "bit deps unset <component> <package>""#,
            false,
        )
    }

    const fn environment_class(self) -> (&'static str, &'static str, &'static str, bool) {
        match self {
            Self::NonLoadedEnv => {
                ("NonLoadedEnv", "failed loading env", r#"run "bit install""#, true)
            }
            Self::MultipleEnvs => (
                "MultipleEnvs",
                "multiple envs",
                r#"set the desired env by running "bit env set <component> <env>", if it doesn't work, run "bit aspect unset <component> <unwanted-env-id>". to keep troubleshooting run "bit aspect list <component-id>""#,
                true,
            ),
            Self::RemovedEnv => (
                "RemovedEnv",
                "the env of this component is deleted",
                r#"use "bit env set/replace" to set a new env or a different version of this env. to undo the delete, run "bit recover""#,
                true,
            ),
            _ => unreachable!(),
        }
    }

    /// `issue.toObject()` plus `dataAsString`.
    pub(super) fn to_object(self, data: &Value) -> io::Result<Value> {
        let (kind, description, solution, blocker) = self.class();
        let text = self.data_to_string(data)?;
        if text.contains('\u{1b}') {
            return Err(decline("status issue data with escape sequences"));
        }
        Ok(json!({
            "type": kind,
            "description": description,
            "solution": solution,
            "isTagBlocker": blocker,
            "data": data,
            "dataAsString": text,
        }))
    }

    /// `issue.dataToString()`.
    fn data_to_string(self, data: &Value) -> io::Result<String> {
        match self {
            Self::Detected(kind) => kind.data_to_string(data),
            Self::MissingManual
            | Self::RemovedDependencies
            | Self::MultipleEnvs
            | Self::DeprecatedDependencies
            | Self::PinnedDependencies => Ok(format!("{SPACE}{}", join(data)?)),
            Self::Duplicate | Self::NonLoadedEnv | Self::RemovedEnv => {
                Ok(format!("{SPACE}{}", text(Some(data))?))
            }
            Self::MissingPackages => missing_packages_to_string(data),
            Self::MissingDependencies | Self::ImportFromDirectory => {
                let files = data.as_object().ok_or_else(|| decline("status issue file data"))?;
                files
                    .iter()
                    .map(|(file, items)| Ok(format!("{SPACE}{file} -> {}", list_or_text(items)?)))
                    .collect::<io::Result<Vec<_>>>()
                    .map(|rows| rows.join("\n"))
            }
            // `Object.keys(true)` is empty.
            Self::MissingLinks | Self::MissingDists | Self::Circular => match data {
                Value::Bool(_) => Ok(String::new()),
                Value::Array(items) if items.is_empty() => Ok(String::new()),
                Value::Object(map) if map.is_empty() => Ok(String::new()),
                _ => Err(decline("status issue data")),
            },
        }
    }
}

fn missing_packages_to_string(data: &Value) -> io::Result<String> {
    let rows = array(Some(data), "missing packages")?
        .iter()
        .map(|row| {
            let file = text(
                row.get("filePath")
                    .or_else(|| row.get("file"))
                    .or_else(|| row.get("path")),
            )?;
            let packages = row
                .get("missingPackages")
                .or_else(|| row.get("packages"))
                .ok_or_else(|| decline("missing packages"))?;
            Ok(format!("{SPACE}{file} -> {}", list_or_text(packages)?))
        });
    Ok(rows.collect::<io::Result<Vec<_>>>()?.join("\n"))
}

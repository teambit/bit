//! The native import grammar: `bit fetch -c <ids...>` and `bit import`
//! with ids or wildcard patterns, with or without installing.

use serde_json::{Value, json};

#[derive(Debug, PartialEq, Eq)]
pub struct Options {
    /// `import` or `fetch`.
    pub operation: &'static str,
    pub ids: Vec<String>,
    pub objects_only: bool,
    pub all_history: bool,
    pub skip_dependency_installation: bool,
    pub lanes: bool,
    /// `--skip-write-config-files`
    pub skip_write_config_files: bool,
    /// `--include-deprecated`: wildcard patterns keep deprecated components.
    pub include_deprecated: bool,
}

/// `args` starts with the command name.
pub fn parse(args: &[&str]) -> Option<Options> {
    let operation = match *args.first()? {
        "fetch" => "fetch",
        "import" => "import",
        _ => return None,
    };
    let (ids, flags) = split(&args[1..])?;
    if operation == "fetch" { fetch(ids, &flags) } else { import(ids, &flags) }
}

/// The ids and the distinct flags.
fn split<'a>(args: &[&'a str]) -> Option<(Vec<String>, Vec<&'a str>)> {
    let mut ids = Vec::new();
    let mut flags: Vec<&str> = Vec::new();
    for arg in args {
        let duplicate = flags.contains(arg);
        let invalid_id =
            arg.is_empty() || arg.len() > 4096 || arg.contains('\0') || ids.len() >= 4096;
        match (arg.starts_with('-'), duplicate, invalid_id) {
            (true, false, _) => flags.push(arg),
            (false, _, false) => ids.push((*arg).to_string()),
            _ => return None,
        }
    }
    Some((ids, flags))
}

/// `bit fetch --components [ids...]`.
fn fetch(ids: Vec<String>, flags: &[&str]) -> Option<Options> {
    let allowed = ["--components", "-c", "--lanes", "-l", "--all-history"];
    let components =
        usize::from(flags.contains(&"--components")) + usize::from(flags.contains(&"-c"));
    let lanes = usize::from(flags.contains(&"--lanes")) + usize::from(flags.contains(&"-l"));
    if flags
        .iter()
        .any(|flag| !allowed.contains(flag))
        || components + lanes != 1
        || (lanes == 1 && (ids.is_empty() || ids.len() > 32 || flags.contains(&"--all-history")))
    {
        return None;
    }
    let all_history = flags.contains(&"--all-history");
    Some(Options {
        operation: "fetch",
        ids,
        objects_only: true,
        all_history,
        skip_dependency_installation: false,
        lanes: lanes == 1,
        skip_write_config_files: false,
        include_deprecated: false,
    })
}

/// `bit import`: objects only, or the components written and installed.
fn import(ids: Vec<String>, flags: &[&str]) -> Option<Options> {
    let has = |flag: &str| flags.contains(&flag);
    let allowed = [
        "--objects",
        "-o",
        "--all-history",
        "--skip-dependency-installation",
        "-x",
        "--skip-write-config-files",
        "--include-deprecated",
    ];
    let both =
        (has("--objects") && has("-o")) || (has("--skip-dependency-installation") && has("-x"));
    if flags
        .iter()
        .any(|flag| !allowed.contains(flag))
        || both
    {
        return None;
    }
    if ids
        .iter()
        .any(|id| has_wildcard(id) && !valid_pattern(id))
    {
        return None;
    }
    let objects_only = ids.is_empty() || has("--objects") || has("-o");
    let skip_dependency_installation = has("--skip-dependency-installation") || has("-x");
    let all_history = has("--all-history");
    Some(Options {
        operation: "import",
        ids,
        objects_only,
        all_history,
        skip_dependency_installation,
        lanes: false,
        skip_write_config_files: has("--skip-write-config-files"),
        include_deprecated: has("--include-deprecated"),
    })
}

/// `hasWildcard`.
pub fn has_wildcard(id: &str) -> bool {
    id.contains('*')
}

/// `<scope>/<namespaces with wildcards>`: `getRemoteCompIdsByWildcards`
/// needs the scope written out.
fn valid_pattern(id: &str) -> bool {
    id.split_once('/')
        .is_some_and(|(scope, rest)| !scope.is_empty() && !scope.contains('*') && !rest.is_empty())
        && !id.starts_with('@')
}

impl Options {
    /// Whether the components are written and then installed.
    pub const fn installs(&self) -> bool {
        !self.objects_only && !self.skip_dependency_installation
    }

    /// The wildcard patterns, listed on their remotes before importing.
    pub fn wildcards(&self) -> Vec<&String> {
        self.ids
            .iter()
            .filter(|id| has_wildcard(id))
            .collect()
    }

    /// The `options` of `commandInboundPrepare`.
    pub fn request(&self) -> Value {
        json!({
            "objectsOnly": self.objects_only,
            "allHistory": self.all_history,
            "fromOriginalScope": false,
            "skipDependencyInstallation": self.skip_dependency_installation,
            "lanes": self.lanes,
            "components": self.operation == "fetch" && !self.lanes,
        })
    }
}

#[cfg(test)]
mod options_tests;

//! `parseRustWorkspaceInbound`: `bit fetch -c <ids...>` and the `bit import`
//! forms that write no component files or install nothing.

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
        || (lanes == 1 && (ids.len() != 1 || flags.contains(&"--all-history")))
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
    })
}

/// `bit import`: objects only, or without installing.
fn import(ids: Vec<String>, flags: &[&str]) -> Option<Options> {
    let has = |flag: &str| flags.contains(&flag);
    let allowed = ["--objects", "-o", "--all-history", "--skip-dependency-installation", "-x"];
    let both =
        (has("--objects") && has("-o")) || (has("--skip-dependency-installation") && has("-x"));
    if flags
        .iter()
        .any(|flag| !allowed.contains(flag))
        || both
    {
        return None;
    }
    let objects_only = ids.is_empty() || has("--objects") || has("-o");
    let skip_dependency_installation = has("--skip-dependency-installation") || has("-x");
    if !objects_only && !skip_dependency_installation {
        return None;
    }
    let all_history = has("--all-history");
    Some(Options {
        operation: "import",
        ids,
        objects_only,
        all_history,
        skip_dependency_installation,
        lanes: false,
    })
}

impl Options {
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

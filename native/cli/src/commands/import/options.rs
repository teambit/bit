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
    pub write: WriteOptions,
    pub lanes: bool,
    /// `--skip-write-config-files`
    pub skip_write_config_files: bool,
    /// `--include-deprecated`: wildcard patterns keep deprecated components.
    pub selection: SelectionOptions,
}

#[derive(Debug, PartialEq, Eq)]
pub struct WriteOptions {
    pub skip_dependency_installation: bool,
    pub override_existing: bool,
    pub path: Option<String>,
    pub merge_strategy: Option<String>,
    pub dependencies: DependencyOptions,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct SelectionOptions {
    pub include_deprecated: bool,
    pub lane_only: bool,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct DependencyOptions {
    pub import_dependencies: bool,
    pub import_head_dependencies: bool,
    pub depth: Option<usize>,
}

/// `args` starts with the command name.
pub fn parse(args: &[&str]) -> Option<Options> {
    let operation = match *args.first()? {
        "fetch" => "fetch",
        "import" => "import",
        _ => return None,
    };
    if operation == "fetch" {
        let (ids, flags) = split(&args[1..])?;
        fetch(ids, &flags)
    } else {
        let (args, path) = take_path(&args[1..])?;
        let (args, depth) = take_depth(&args)?;
        let (ids, flags) = split(&args)?;
        import(ids, &flags, path, depth)
    }
}

fn take_depth<'a>(args: &[&'a str]) -> Option<(Vec<&'a str>, Option<usize>)> {
    let mut remaining = Vec::with_capacity(args.len());
    let mut depth = None;
    let mut position = 0;
    while position < args.len() {
        if args[position] == "--dependencies-depth" {
            let value = args
                .get(position + 1)?
                .parse::<usize>()
                .ok()?;
            if depth.is_some() || value == 0 || value > 4096 {
                return None;
            }
            depth = Some(value);
            position += 2;
        } else {
            remaining.push(args[position]);
            position += 1;
        }
    }
    Some((remaining, depth))
}

fn take_path<'a>(args: &[&'a str]) -> Option<(Vec<&'a str>, Option<String>)> {
    let mut remaining = Vec::with_capacity(args.len());
    let mut path = None;
    let mut position = 0;
    while position < args.len() {
        if args[position] == "-p" || args[position] == "--path" {
            let value = *args.get(position + 1)?;
            if path.is_some() || value.is_empty() || value.starts_with('-') || value.len() > 4096 {
                return None;
            }
            path = Some(value.to_owned());
            position += 2;
        } else {
            remaining.push(args[position]);
            position += 1;
        }
    }
    Some((remaining, path))
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
        write: WriteOptions {
            skip_dependency_installation: false,
            override_existing: false,
            path: None,
            merge_strategy: None,
            dependencies: DependencyOptions::default(),
        },
        lanes: lanes == 1,
        skip_write_config_files: false,
        selection: SelectionOptions::default(),
    })
}

/// `bit import`: objects only, or the components written and installed.
fn import(
    ids: Vec<String>,
    flags: &[&str],
    path: Option<String>,
    depth: Option<usize>,
) -> Option<Options> {
    let has = |flag: &str| flags.contains(&flag);
    if !valid_import_args(flags, &ids) {
        return None;
    }
    let objects_only = ids.is_empty() || has("--objects") || has("-o");
    let merge_strategy = merge_strategy(flags)?;
    let dependencies = DependencyOptions {
        import_dependencies: has("--dependencies"),
        import_head_dependencies: has("--dependencies-head"),
        depth,
    };
    if !valid_import_mode(
        &dependencies,
        &ids,
        objects_only,
        has("--override"),
        merge_strategy.as_deref(),
        path.as_deref(),
    ) {
        return None;
    }
    Some(Options {
        operation: "import",
        ids,
        objects_only,
        all_history: has("--all-history"),
        write: WriteOptions {
            skip_dependency_installation: has("--skip-dependency-installation") || has("-x"),
            override_existing: has("--override"),
            path,
            merge_strategy,
            dependencies,
        },
        lanes: false,
        skip_write_config_files: has("--skip-write-config-files"),
        selection: SelectionOptions {
            include_deprecated: has("--include-deprecated"),
            lane_only: has("--lane-only"),
        },
    })
}

fn valid_import_args(flags: &[&str], ids: &[String]) -> bool {
    valid_import_flags(flags)
        && (!flags.contains(&"--lane-only") || ids.iter().any(|id| has_wildcard(id)))
        && !ids
            .iter()
            .any(|id| has_wildcard(id) && !valid_pattern(id))
}

fn valid_import_mode(
    dependencies: &DependencyOptions,
    ids: &[String],
    objects_only: bool,
    override_existing: bool,
    merge_strategy: Option<&str>,
    path: Option<&str>,
) -> bool {
    valid_dependencies(dependencies, ids, objects_only, override_existing, merge_strategy, path)
        && valid_merge_mode(merge_strategy, ids, objects_only, override_existing)
        && (!override_existing || (!objects_only && !ids.iter().any(|id| has_wildcard(id))))
        && valid_path(path, ids, objects_only)
}

fn valid_dependencies(
    options: &DependencyOptions,
    ids: &[String],
    objects_only: bool,
    override_existing: bool,
    merge_strategy: Option<&str>,
    path: Option<&str>,
) -> bool {
    let enabled = options.import_dependencies || options.import_head_dependencies;
    if options.import_dependencies && options.import_head_dependencies
        || options.depth.is_some() && !enabled
    {
        return false;
    }
    !enabled
        || !objects_only
            && !ids.is_empty()
            && !override_existing
            && merge_strategy.is_none()
            && path.is_none()
}

fn valid_merge_mode(
    strategy: Option<&str>,
    ids: &[String],
    objects_only: bool,
    override_existing: bool,
) -> bool {
    strategy.is_none()
        || !objects_only && ids.len() == 1 && !has_wildcard(&ids[0]) && !override_existing
}

fn valid_path(path: Option<&str>, ids: &[String], objects_only: bool) -> bool {
    path.is_none() || !objects_only && ids.len() == 1 && !has_wildcard(&ids[0])
}

fn valid_import_flags(flags: &[&str]) -> bool {
    let allowed = [
        "--objects",
        "-o",
        "--all-history",
        "--skip-dependency-installation",
        "-x",
        "--skip-write-config-files",
        "--include-deprecated",
        "--override",
        "--dependencies",
        "--dependencies-head",
        "--lane-only",
    ];
    let has = |flag: &str| flags.contains(&flag);
    let both =
        (has("--objects") && has("-o")) || (has("--skip-dependency-installation") && has("-x"));
    !both
        && flags
            .iter()
            .all(|flag| {
                allowed.contains(flag)
                    || matches!(*flag, "--merge=manual" | "--merge=ours" | "--merge=theirs")
            })
}

fn merge_strategy(flags: &[&str]) -> Option<Option<String>> {
    let mut strategy = None;
    for flag in flags {
        if let Some(value) = flag.strip_prefix("--merge=") {
            if strategy.is_some() {
                return None;
            }
            strategy = Some(value.to_owned());
        }
    }
    Some(strategy)
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
        !self.objects_only && !self.write.skip_dependency_installation
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
            "skipDependencyInstallation": self.write.skip_dependency_installation,
            "overrideExisting": self.write.override_existing,
            "path": self.write.path,
            "mergeStrategy": self.write.merge_strategy,
            "importDependencies": self.write.dependencies.import_dependencies,
            "importHeadDependencies": self.write.dependencies.import_head_dependencies,
            "dependenciesDepth": self.write.dependencies.depth,
            "lanes": self.lanes,
            "components": self.operation == "fetch" && !self.lanes,
        })
    }
}

#[cfg(test)]
mod options_tests;

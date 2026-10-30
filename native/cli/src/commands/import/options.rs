//! The native import grammar: `bit fetch -c <ids...>` and `bit import`
//! with ids or wildcard patterns, with or without installing.

pub use adoption::{AdoptionOptions, DependentsOptions};

mod adoption;
mod semantic;
mod validation;

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
    pub output: OutputOptions,
    /// `--include-deprecated`: wildcard patterns keep deprecated components.
    pub selection: SelectionOptions,
}

#[derive(Debug, PartialEq, Eq)]
pub struct WriteOptions {
    pub skip_write_config_files: bool,
    pub skip_dependency_installation: bool,
    pub override_existing: bool,
    pub merge: bool,
    pub path: Option<String>,
    pub merge_strategy: Option<String>,
    pub dependencies: DependencyOptions,
    pub adoption: AdoptionOptions,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct OutputOptions {
    pub json: bool,
    pub verbose: bool,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct SelectionOptions {
    pub include_deprecated: bool,
    pub lane_only: bool,
    pub dependents: DependentsOptions,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct DependencyOptions {
    pub fetch_deps: bool,
    pub import_dependencies: bool,
    pub import_head_dependencies: bool,
    pub depth: Option<usize>,
    pub raw_depth: Option<String>,
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
        let values = adoption::values(&args)?;
        let (ids, flags) = split(&values.args)?;
        import(ids, &flags, path, depth, values)
    }
}

fn take_depth<'a>(args: &[&'a str]) -> Option<(Vec<&'a str>, Option<String>)> {
    let mut remaining = Vec::with_capacity(args.len());
    let mut depth = None;
    let mut position = 0;
    while position < args.len() {
        if let Some(value) = args[position].strip_prefix("--dependencies-depth=") {
            set_bounded_option(&mut depth, value)?;
            position += 1;
        } else if args[position] == "--dependencies-depth" {
            let value = *args.get(position + 1)?;
            set_bounded_option(&mut depth, value)?;
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
        if let Some(value) = args[position]
            .strip_prefix("--path=")
            .or_else(|| args[position].strip_prefix("-p="))
        {
            set_bounded_option(&mut path, value)?;
            position += 1;
        } else if args[position] == "-p" || args[position] == "--path" {
            let value = *args.get(position + 1)?;
            set_bounded_option(&mut path, value)?;
            position += 2;
        } else {
            remaining.push(args[position]);
            position += 1;
        }
    }
    Some((remaining, path))
}

fn set_bounded_option(slot: &mut Option<String>, value: &str) -> Option<()> {
    if slot.is_some() || value.is_empty() || value.starts_with('-') || value.len() > 4096 {
        return None;
    }
    *slot = Some(value.to_owned());
    Some(())
}

/// The ids and the distinct flags.
fn split<'a>(args: &[&'a str]) -> Option<(Vec<String>, Vec<&'a str>)> {
    let mut ids = Vec::new();
    let mut flags: Vec<&str> = Vec::new();
    for arg in args {
        if *arg == "--no-color" {
            continue;
        }
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
    let allowed =
        ["--components", "-c", "--lanes", "-l", "--all-history", "--from-original-scopes"];
    let components =
        usize::from(flags.contains(&"--components")) + usize::from(flags.contains(&"-c"));
    let lanes = usize::from(flags.contains(&"--lanes")) + usize::from(flags.contains(&"-l"));
    if flags
        .iter()
        .any(|flag| !allowed.contains(flag))
        || components + lanes != 1
        || (lanes == 1 && ids.len() > 33)
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
            skip_write_config_files: false,
            skip_dependency_installation: false,
            override_existing: false,
            merge: false,
            path: None,
            merge_strategy: None,
            dependencies: DependencyOptions::default(),
            adoption: AdoptionOptions::default(),
        },
        lanes: lanes == 1,
        output: OutputOptions::default(),
        // The released FetchCmd advertises this flag but destructures the
        // singular `fromOriginalScope`, so the public flag has no effect.
        selection: SelectionOptions::default(),
    })
}

/// `bit import`: objects only, or the components written and installed.
fn import(
    ids: Vec<String>,
    flags: &[&str],
    path: Option<String>,
    raw_depth: Option<String>,
    values: adoption::Values<'_>,
) -> Option<Options> {
    let has = |flag: &str| flags.contains(&flag);
    if !validation::args(flags, &ids) {
        return None;
    }
    let objects_only = ids.is_empty() || has("--objects") || has("-o");
    let adoption = AdoptionOptions::parse(flags, values.write_deps);
    let mut dependents = DependentsOptions::parse(flags, values.dependents_via);
    if !dependents.valid(&ids) {
        return None;
    }
    // ImportAccordingToBitMap never calls getBitIds, so this otherwise valid
    // flag has no dependent-selection phase without explicit component IDs.
    if ids.is_empty() {
        dependents.all = false;
    }
    let write = import_write(flags, path, raw_depth, adoption, &ids, objects_only)?;
    Some(Options {
        operation: "import",
        ids,
        objects_only,
        all_history: has("--all-history"),
        write,
        lanes: false,
        output: import_output(flags),
        selection: import_selection(flags, dependents),
    })
}

fn import_write(
    flags: &[&str],
    path: Option<String>,
    raw_depth: Option<String>,
    adoption: AdoptionOptions,
    ids: &[String],
    objects_only: bool,
) -> Option<WriteOptions> {
    let has = |flag: &str| flags.contains(&flag);
    let merge_strategy = merge_strategy(flags)?;
    let merge = has("--merge") || merge_strategy.is_some();
    let depth = raw_depth
        .as_deref()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|&value| (1..=4096).contains(&value));
    let dependencies = DependencyOptions {
        fetch_deps: has("--fetch-deps"),
        import_dependencies: has("--dependencies"),
        import_head_dependencies: has("--dependencies-head"),
        depth,
        raw_depth,
    };
    let explicit_objects = has("--objects") || has("-o");
    let write = WriteOptions {
        skip_write_config_files: has("--skip-write-config-files"),
        skip_dependency_installation: has("--skip-dependency-installation") || has("-x"),
        override_existing: has("--override"),
        merge,
        path,
        merge_strategy,
        dependencies,
        adoption,
    };
    validation::mode(&write, ids, objects_only, explicit_objects).then_some(write)
}

fn valid_import_flags(flags: &[&str]) -> bool {
    let allowed = [
        "--json",
        "-j",
        "--verbose",
        "-v",
        "--objects",
        "-o",
        "--all-history",
        "--skip-dependency-installation",
        "-x",
        "--skip-write-config-files",
        "--include-deprecated",
        "--override",
        "--merge",
        "--fetch-deps",
        "--dependencies",
        "--dependencies-head",
        "--lane-only",
        "--track-only",
        "--write-to-empty-dir",
        "--dependents",
        "--dependents-all",
        "--silent",
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
            if strategy.is_some() || flags.contains(&"--merge") {
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
    pub fn validation_error(&self) -> Option<String> {
        semantic::error(self)
    }
    pub fn needs_installer(&self) -> bool {
        self.installs() && self.validation_error().is_none()
    }
    pub fn requires_facts(&self) -> bool {
        self.validation_error().is_none()
            && (self.installs()
                || !self.objects_only && self.write.adoption.write_deps.is_some()
                || self.selection.dependents.active())
    }
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
            "fetchDeps": self.write.dependencies.fetch_deps,
            "skipDependencyInstallation": self.write.skip_dependency_installation,
            "overrideExisting": self.write.override_existing,
            "path": self.write.path,
            "mergeStrategy": self.write.merge_strategy,
            "importDependencies": self.write.dependencies.import_dependencies,
            "importHeadDependencies": self.write.dependencies.import_head_dependencies,
            "dependenciesDepth": self.write.dependencies.depth,
            "lanes": self.lanes,
            "components": self.operation == "fetch" && !self.lanes,
            "adoption": self.write.adoption.request(),
            "dependents": self.selection.dependents.request(),
        })
    }
}

#[cfg(test)]
mod options_tests;

fn import_output(flags: &[&str]) -> OutputOptions {
    OutputOptions {
        json: flags.contains(&"--json") || flags.contains(&"-j"),
        verbose: flags.contains(&"--verbose") || flags.contains(&"-v"),
    }
}

fn import_selection(flags: &[&str], dependents: DependentsOptions) -> SelectionOptions {
    SelectionOptions {
        include_deprecated: flags.contains(&"--include-deprecated"),
        lane_only: flags.contains(&"--lane-only"),
        dependents,
    }
}

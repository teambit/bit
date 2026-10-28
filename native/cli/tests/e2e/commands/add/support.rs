//! Exact command bytes and filesystem state replayed at the same absolute workspace path.
pub(crate) mod history_oracle;

mod clock_phase;
mod config_history;
mod hardlinks;
mod install_clocks;
mod object_diagnostic;
mod output;
mod timestamps;

use self::output::Comparison;
use crate::helper::{Helper, Run};
use std::{collections::BTreeMap, ffi::OsStr, fs, path::Path};

pub(crate) fn workspace() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper
}

pub(crate) fn compare(helper: &Helper, command: &str) -> Run {
    compare_mode(helper, command, false, true, Comparison::exact(str::to_owned), false, None)
}

pub(crate) fn compare_ci(helper: &Helper, command: &str, native: bool) -> Run {
    compare_mode(helper, command, true, native, Comparison::exact(str::to_owned), false, None)
}

pub(crate) fn compare_service_output(
    helper: &Helper,
    command: &str,
    stdout: fn(&str) -> String,
    ci: bool,
    colors: bool,
) -> Run {
    let output = Comparison { colors, ..Comparison::exact(stdout) };
    compare_mode(helper, command, ci, true, output, false, None)
}

pub(crate) fn compare_with_stdout(
    helper: &Helper,
    command: &str,
    stdout: fn(&str) -> String,
) -> Run {
    compare_mode(helper, command, false, true, Comparison::exact(stdout), false, None)
}

pub(crate) type ArtifactProjection<'a> =
    dyn Fn(&mut BTreeMap<String, Vec<u8>>, &Run, i64, i64) + 'a;

pub(crate) fn compare_with_artifacts(
    helper: &Helper,
    command: &str,
    stdout: fn(&str) -> String,
    artifacts: &ArtifactProjection<'_>,
) -> Run {
    let output = Comparison { artifacts: Some(artifacts), ..Comparison::exact(stdout) };
    compare_mode(helper, command, false, true, output, false, None)
}

/// Only a caller with independently qualified complete Node errors may use variants.
pub(crate) fn compare_with_error_variants(
    helper: &Helper,
    command: &str,
    stdout: fn(&str) -> String,
    variants: &[String; 2],
) -> Run {
    let output = Comparison { errors: Some(variants), ..Comparison::exact(stdout) };
    compare_mode(helper, command, false, true, output, false, None)
}

/// Require clean delegation while retaining exact command bytes and full state.
pub(crate) fn compare_declined(helper: &Helper, command: &str, stdout: fn(&str) -> String) -> Run {
    compare_mode(helper, command, false, false, Comparison::exact(stdout), false, None)
}

/// A delegated `install` still needs the independently qualified pnpm clock projections.
pub(crate) fn compare_install_declined(
    helper: &Helper,
    command: &str,
    stdout: fn(&str) -> String,
) -> Run {
    compare_mode(helper, command, false, false, Comparison::exact(stdout), true, None)
}

/// Installation clocks are qualified against the baseline or actual command window.
pub(crate) fn compare_install(helper: &Helper, command: &str, stdout: fn(&str) -> String) -> Run {
    compare_mode(helper, command, false, true, Comparison::exact(stdout), true, None)
}

/// Explicit upstream additions remain byte-for-byte assertions while the release is unavailable.
pub(crate) fn compare_install_with_scope_additions(
    helper: &Helper,
    command: &str,
    stdout: fn(&str) -> String,
    additions: &BTreeMap<String, Vec<u8>>,
) -> Run {
    let output = Comparison { scope_additions: Some(additions), ..Comparison::exact(stdout) };
    compare_mode(helper, command, false, true, output, true, None)
}

pub(crate) type HistoryProjection<'a> = dyn Fn(&Path, i64, i64) -> BTreeMap<String, Vec<u8>> + 'a;

/// Case-specific oracle validates every raw history write before comparing logical transitions.
pub(crate) fn compare_with_history(
    helper: &Helper,
    command: &str,
    stdout: fn(&str) -> String,
    observe: &HistoryProjection<'_>,
) -> Run {
    compare_mode(helper, command, false, true, Comparison::exact(stdout), false, Some(observe))
}

/// Successful installation and a per-write oracle retain both independent clock proofs.
pub(crate) fn compare_install_with_history(
    helper: &Helper,
    command: &str,
    stdout: fn(&str) -> String,
    observe: &HistoryProjection<'_>,
) -> Run {
    compare_mode(helper, command, false, true, Comparison::exact(stdout), true, Some(observe))
}

/// CI is scoped to this command while retaining full installation/history state.
pub(crate) fn compare_install_with_history_ci(
    helper: &Helper,
    command: &str,
    stdout: fn(&str) -> String,
    observe: &HistoryProjection<'_>,
    ci: bool,
) -> Run {
    if !ci {
        return compare_install_with_history(helper, command, stdout, observe);
    }
    compare_mode(helper, command, true, true, Comparison::exact(stdout), true, Some(observe))
}

/// The same history projection with per-command CI selection.
pub(crate) fn compare_with_history_ci(
    helper: &Helper,
    command: &str,
    stdout: fn(&str) -> String,
    observe: &HistoryProjection<'_>,
    ci: bool,
) -> Run {
    if !ci {
        return compare_with_history(helper, command, stdout, observe);
    }
    compare_mode(helper, command, true, true, Comparison::exact(stdout), false, Some(observe))
}

/// Untimed oracle preparation restores the identical source/cache/hardlink inputs afterwards.
pub(crate) fn prepare_history<Prepared>(
    helper: &Helper,
    action: impl FnOnce() -> Prepared,
) -> Prepared {
    let root = &helper.scopes.local_path;
    let timestamps = timestamps::Snapshot::read(root);
    let hardlinks = hardlinks::Snapshot::read(root);
    let baseline = helper.clone_workspace();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(action));
    helper.get_cloned_workspace(&baseline);
    hardlinks.restore(root);
    timestamps.restore(root);
    result.unwrap_or_else(|error| std::panic::resume_unwind(error))
}

fn compare_mode(
    helper: &Helper,
    command: &str,
    ci: bool,
    native: bool,
    output: Comparison<'_>,
    install_clocks: bool,
    oracle: Option<&HistoryProjection<'_>>,
) -> Run {
    let timestamps = timestamps::Snapshot::read(&helper.scopes.local_path);
    let hardlinks = hardlinks::Snapshot::read(&helper.scopes.local_path);
    let baseline = helper.clone_workspace();
    let root = &helper.scopes.local_path;
    let baseline_history = History::read(root);
    let config_history = config_history::Snapshot::read(root);
    let modules = fs::read(root.join("node_modules/.modules.yaml")).ok();
    let environment = command_environment(ci, false, output.colors);
    clock_phase::align(command);
    let started = chrono::Utc::now().timestamp_millis();
    let expected =
        Helper::cmd_in_with(root, command, &command_environment(ci, true, output.colors));
    let ended = chrono::Utc::now().timestamp_millis();
    let mut expected_files = tree(root);
    if install_clocks {
        assert!(
            expected.status.success(),
            "{command}: Node installation failed: {} {}",
            expected.stdout,
            expected.stderr,
        );
        assert!(
            expected_files.contains_key("node_modules/.modules.yaml"),
            "{command}: Node installation did not create pnpm metadata: {} {}",
            expected.stdout,
            expected.stderr,
        );
        install_clocks::project(&mut expected_files, modules.as_deref(), started, ended);
    }
    if let Some(project) = output.artifacts {
        project(&mut expected_files, &expected, started, ended);
    }
    let mut expected_scope = scope_tree(root, &config_history);
    if let Some(additions) = output.scope_additions {
        for (path, bytes) in additions {
            assert!(
                expected_scope.insert(path.clone(), bytes.clone()).is_none(),
                "upstream addition replaces an existing reference entry: {path}",
            );
        }
    }
    let expected_history = oracle.map_or_else(
        || history(root, &baseline_history),
        |observe| observe(root, started, ended),
    );
    helper.get_cloned_workspace(&baseline);
    hardlinks.restore(root);
    timestamps.restore(root);
    clock_phase::align(command);
    let started = chrono::Utc::now().timestamp_millis();
    let actual = Helper::cmd_in_with(root, command, &environment);
    let ended = chrono::Utc::now().timestamp_millis();
    assert_eq!(actual.native, native, "{command}: {}", actual.trace);
    if !native {
        assert!(actual.trace.contains("delegating:"), "{}", actual.trace);
    }
    assert_eq!(
        actual.status.code(),
        expected.status.code(),
        "{command}: {} {}\n{}",
        actual.stderr,
        expected.stderr,
        actual.trace,
    );
    assert_eq!((output.stdout)(&actual.stdout), (output.stdout)(&expected.stdout), "{command}");
    match output.errors {
        Some(variants) => output::assert_errors(&actual.stderr, &expected.stderr, variants),
        None => {
            assert_eq!(atomic_error(&actual.stderr), atomic_error(&expected.stderr), "{command}");
        }
    }
    let mut actual_files = tree(root);
    if install_clocks {
        install_clocks::project(&mut actual_files, modules.as_deref(), started, ended);
    }
    if let Some(project) = output.artifacts {
        project(&mut actual_files, &actual, started, ended);
    }
    compare_paths(&actual_files, &expected_files, command);
    compare_paths(&scope_tree(root, &config_history), &expected_scope, "scope objects/controls");
    compare_paths(
        &oracle.map_or_else(
            || history(root, &baseline_history),
            |observe| observe(root, started, ended),
        ),
        &expected_history,
        "bitmap history bodies/reasons",
    );
    actual
}

fn command_environment(
    ci: bool,
    oracle: bool,
    colors: bool,
) -> Vec<(&'static str, &'static OsStr)> {
    let mut environment = vec![("BIT_NATIVE_QUIET", OsStr::new("1"))];
    if ci {
        environment.push(("CI", OsStr::new("1")));
    }
    if oracle {
        environment.push(("BIT_NATIVE", OsStr::new("off")));
    }
    if colors {
        environment.push(("FORCE_COLOR", OsStr::new("1")));
    }
    environment
}

pub(crate) fn node(root: &Path, command: &str) -> Run {
    Helper::cmd_in_with(root, command, &[("BIT_NATIVE", OsStr::new("off"))])
}

fn tree(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut output = BTreeMap::new();
    visit(root, root, &mut output);
    output
}
fn visit(root: &Path, directory: &Path, output: &mut BTreeMap<String, Vec<u8>>) {
    for entry in fs::read_dir(directory).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        if [".bit", ".git", "debug.log"].contains(&relative.as_str()) {
            continue;
        }
        let metadata = fs::symlink_metadata(&path).unwrap();
        if metadata.file_type().is_symlink() {
            let link = fs::read_link(&path)
                .unwrap()
                .to_string_lossy()
                .replace(root.to_str().unwrap(), "<workspace>");
            output.insert(relative, format!("symlink:{link}").into_bytes());
        } else if metadata.is_dir() {
            output.insert(format!("{relative}/"), directory_mode(&relative, &metadata));
            visit(root, &path, output);
        } else {
            output.insert(format!("{relative}:mode"), mode(&metadata));
            output.insert(relative, fs::read(path).unwrap());
        }
    }
}

fn directory_mode(relative: &str, metadata: &fs::Metadata) -> Vec<u8> {
    // pnpm package directory modes vary between identical released Node installs.
    // Keep their paths and contents in the comparison; check modes elsewhere.
    if relative.starts_with("node_modules/.pnpm/") { Vec::new() } else { mode(metadata) }
}

#[derive(PartialEq, Eq)]
struct Backup {
    bytes: Vec<u8>,
    mode: Vec<u8>,
}
struct History {
    metadata: String,
    backups: BTreeMap<String, Backup>,
    bitmap: Option<Vec<u8>>,
}
impl History {
    fn read(root: &Path) -> Self {
        let scope = bit_object_import::scope_path(root);
        let backups = fs::read_dir(scope.join("bitmap-history"))
            .into_iter()
            .flatten()
            .map(|entry| {
                let path = entry.unwrap().path();
                (
                    path.file_name()
                        .unwrap()
                        .to_str()
                        .unwrap()
                        .to_owned(),
                    Backup {
                        bytes: fs::read(&path).unwrap(),
                        mode: mode(&fs::metadata(path).unwrap()),
                    },
                )
            })
            .collect();
        Self {
            metadata: fs::read_to_string(scope.join("bitmap-history-metadata.txt"))
                .unwrap_or_default(),
            backups,
            bitmap: fs::read(root.join(".bitmap")).ok(),
        }
    }
}

// Published backups use second-resolution names. Repeated writes can overwrite
// that second's backup; keep all reasons and validate every retained snapshot,
// including a collided baseline snapshot, against the actual pre-command bitmap.
fn history(root: &Path, baseline: &History) -> BTreeMap<String, Vec<u8>> {
    let current = History::read(root);
    let appended = current.metadata
        .strip_prefix(&baseline.metadata)
        .expect("baseline history metadata changed");
    let mut output = BTreeMap::new();
    let mut fresh_names = std::collections::BTreeSet::new();
    assert!(appended.is_empty() || appended.ends_with('\n'), "history metadata newline missing");
    for (index, line) in appended.split_inclusive('\n').enumerate() {
        fresh_names.insert(history_entry(line, index, baseline, &current, &mut output));
    }
    for (name, bytes) in &baseline.backups {
        if !fresh_names.contains(name) {
            assert!(current.backups.get(name) == Some(bytes), "baseline backup changed: {name}");
        }
        output.insert(format!("baseline/{name}"), bytes.bytes.clone());
        output.insert(format!("baseline/{name}/mode"), bytes.mode.clone());
    }
    let names: std::collections::BTreeSet<_> = baseline.backups
        .keys()
        .chain(fresh_names.iter())
        .collect();
    assert!(names == current.backups.keys().collect(), "unreferenced bitmap history snapshots");
    let scope = bit_object_import::scope_path(root);
    for name in ["bitmap-history", "bitmap-history-metadata.txt"] {
        if let Ok(metadata) = fs::metadata(scope.join(name)) {
            output.insert(format!("{name}/mode"), mode(&metadata));
        }
    }
    output
}
fn history_entry(
    line: &str,
    index: usize,
    baseline: &History,
    current: &History,
    output: &mut BTreeMap<String, Vec<u8>>,
) -> String {
    let (id, reason) = line.split_once(' ').unwrap();
    validate_history_id(id);
    let name = format!(".bitmap-{id}");
    let snapshot = current.backups.get(&name).expect("missing referenced bitmap backup");
    if reason.trim_end_matches(['\r', '\n']) == "add"
        && let Some(before) = &baseline.bitmap
    {
        assert!(&snapshot.bytes == before, "add backup differs from pre-command bitmap");
    }
    output.insert(format!("fresh/{index}/reason"), reason.as_bytes().to_vec());
    output.insert(format!("fresh/{index}/snapshot"), snapshot.bytes.clone());
    output.insert(format!("fresh/{index}/mode"), snapshot.mode.clone());
    name
}

fn validate_history_id(id: &str) {
    let parts: Vec<u32> = id
        .split('-')
        .map(|part| part.parse().unwrap())
        .collect();
    assert_eq!(parts.len(), 6);
    assert!(
        chrono::NaiveDate::from_ymd_opt(parts[0].try_into().unwrap(), parts[1], parts[2])
            .and_then(|date| date.and_hms_opt(parts[3], parts[4], parts[5]))
            .is_some(),
    );
}

fn scope_tree(root: &Path, baseline: &config_history::Snapshot) -> BTreeMap<String, Vec<u8>> {
    let scope = bit_object_import::scope_path(root);
    let mut output = BTreeMap::new();
    visit(&scope, &scope, &mut output);
    output.retain(|key, _| {
        !key.starts_with("bitmap-history/")
            && !key.starts_with("bitmap-history-metadata.txt")
            && !key.starts_with("command-history")
    });
    for kind in ["deps", "docs"] {
        let prefix = format!("cache/components/{kind}/index-v5/");
        for (path, bytes) in &mut output {
            if path.starts_with(&prefix) && !path.ends_with('/') && !path.ends_with(":mode") {
                *bytes = cache_index(bytes);
            }
        }
    }
    config_history::normalize(root, baseline, &mut output);
    let commands = fs::read_to_string(scope.join("command-history")).unwrap_or_default();
    let commands = commands
        .lines()
        .map(|line| {
            let mut fields = line.splitn(3, ' ');
            chrono::DateTime::parse_from_rfc3339(fields.next().unwrap()).unwrap();
            fields
                .next()
                .unwrap()
                .parse::<u32>()
                .unwrap();
            fields.next().unwrap()
        })
        .collect::<Vec<_>>()
        .join("\n");
    output.insert("command-history:normalized".into(), commands.into_bytes());
    output
}
fn mode(metadata: &fs::Metadata) -> Vec<u8> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata
            .permissions()
            .mode()
            .to_le_bytes()
            .to_vec()
    }
    #[cfg(not(unix))]
    {
        vec![u8::from(metadata.permissions().readonly())]
    }
}

fn compare_paths(
    actual: &BTreeMap<String, Vec<u8>>,
    expected: &BTreeMap<String, Vec<u8>>,
    label: &str,
) {
    let paths: std::collections::BTreeSet<_> = actual
        .keys()
        .chain(expected.keys())
        .collect();
    let different: Vec<_> = paths
        .into_iter()
        .filter(|path| actual.get(*path) != expected.get(*path))
        .map(|path| {
            format!(
                "{path}: native={} node={}",
                describe(actual.get(path), path),
                describe(expected.get(path), path),
            )
        })
        .collect();
    assert!(
        different.is_empty(),
        "{label}: {} differing paths\n{}",
        different.len(),
        different
            .iter()
            .take(20)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n"),
    );
}
fn describe(bytes: Option<&Vec<u8>>, path: &str) -> String {
    use sha1::{Digest, Sha1};
    match bytes {
        None => "missing".into(),
        Some(bytes) if path.starts_with("objects/") && !path.ends_with(":mode") => {
            object_diagnostic::decode(bytes)
                .unwrap_or_else(|| format!("{} bytes sha1={:x}", bytes.len(), Sha1::digest(bytes)))
        }
        Some(bytes)
            if bytes.len() <= diagnostic_limit(path)
                && (matches!(bytes.first(), Some(b'{' | b'['))
                    || bytes.starts_with(b"//")
                    || bytes.starts_with(b"/*")
                    || path == "node_modules/.modules.yaml"
                    || path.ends_with(".jsonl")) =>
        {
            String::from_utf8_lossy(bytes).into_owned()
        }
        Some(bytes) if bytes.len() <= 100 => format!("{bytes:?}"),
        Some(bytes) => format!("{} bytes sha1={:x}", bytes.len(), Sha1::digest(bytes)),
    }
}

fn diagnostic_limit(path: &str) -> usize {
    match path {
        "unmerged.json" => 2048,
        "node_modules/.modules.yaml" | "node_modules/.pnpm-workspace-state-v1.json" => 16_384,
        _ => 4096,
    }
}

// Match cacache's checksum-validated latest effective receipt per key. Only its
// wall-clock fields vary; paths, integrity, metadata and content stay exact.
fn cache_index(bytes: &[u8]) -> Vec<u8> {
    use sha1::{Digest, Sha1};
    let mut entries = BTreeMap::new();
    for line in std::str::from_utf8(bytes)
        .unwrap()
        .lines()
        .filter(|line| !line.is_empty())
    {
        let (checksum, serialized) = line.split_once('\t').unwrap();
        assert_eq!(checksum, format!("{:x}", Sha1::digest(serialized.as_bytes())));
        let mut entry: serde_json::Value = serde_json::from_str(serialized).unwrap();
        let timestamp = entry
            .as_object_mut()
            .unwrap()
            .remove("time")
            .unwrap();
        assert!(
            timestamp
                .as_f64()
                .is_some_and(|value| value >= 0.0),
        );
        if let Some(metadata) = entry.get_mut("metadata").and_then(serde_json::Value::as_object_mut)
            && let Some(timestamp) = metadata.remove("timestamp")
        {
            assert!(
                timestamp
                    .as_f64()
                    .is_some_and(|value| value >= 0.0),
            );
        }
        entries.insert(
            entry["key"]
                .as_str()
                .unwrap()
                .to_owned(),
            entry,
        );
    }
    serde_json::to_vec(&entries).unwrap()
}

// write-file-atomic hashes its module path, process/thread IDs and invocation counter.
// Validate the entire generated source/destination grammar before replacing only that ID.
fn atomic_error(error: &str) -> String {
    let prefix = if cfg!(windows) && error.starts_with("EPERM: operation not permitted, rename '") {
        "EPERM: operation not permitted, rename '"
    } else {
        "EISDIR: illegal operation on a directory, rename '"
    };
    let Some(paths) = error
        .strip_prefix(prefix)
        .and_then(|value| value.strip_suffix("'"))
    else {
        return error.to_owned();
    };
    let Some((source, destination)) = paths.split_once("' -> '") else { return error.to_owned() };
    if !destination.ends_with("/package.json") && !destination.ends_with(r"\package.json") {
        return error.to_owned();
    }
    let Some(suffix) = source
        .strip_prefix(destination)
        .and_then(|value| value.strip_prefix('.'))
    else {
        return error.to_owned();
    };
    if suffix.is_empty()
        || !suffix.bytes().all(|byte| byte.is_ascii_digit())
        || suffix.parse::<u32>().is_err()
    {
        return error.to_owned();
    }
    format!("{prefix}{destination}.<atomic-id>' -> '{destination}'")
}

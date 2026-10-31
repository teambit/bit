//! Published `ExportCmd` option selection and its separate JSON forwarding behavior.
pub(super) struct Options {
    pub ids: Vec<String>,
    pub resume: Option<String>,
    flags: Flags,
    pub lifecycle: LifecycleFlags,
}

#[derive(Default)]
pub(super) struct LifecycleFlags {
    pub eject: bool,
    pub open_browser: bool,
}

#[derive(Default)]
pub(super) struct Flags {
    pub all: bool,
    pub all_versions: bool,
    pub head_only: bool,
    pub origin_directly: bool,
    pub fork_lane_new_scope: bool,
    pub ignore_missing_artifacts: bool,
    pub json: bool,
    pub verbose: bool,
}

/// The same bounded, explicit export grammar as the production JS adapter.
pub(super) fn parse(args: &[&str]) -> Option<Options> {
    let mut options = Options {
        ids: Vec::new(),
        resume: None,
        flags: Flags::default(),
        lifecycle: LifecycleFlags::default(),
    };
    let mut args = args.iter().copied();
    while let Some(arg) = args.next() {
        if arg == "--" {
            for rest in args {
                push_export_id(&mut options, rest)?;
            }
            break;
        }
        apply_export_arg(&mut options, arg, &mut args)?;
    }
    valid_combination(&options).then_some(options)
}

fn push_export_id(options: &mut Options, item: &str) -> Option<()> {
    let item = item.trim();
    if !(is_pattern(item) || valid_id(item)) || options.ids.len() >= 4096 {
        return None;
    }
    options.ids.push(item.to_owned());
    Some(())
}

fn apply_export_arg<'a>(
    options: &mut Options,
    arg: &str,
    args: &mut impl Iterator<Item = &'a str>,
) -> Option<()> {
    if matches!(arg, "--no-color" | "--no-color=true" | "--no-color=false")
        || set_boolean_flag(options, arg)
    {
        return Some(());
    }
    if let Some(val) = arg.strip_prefix("--resume=") {
        return set_resume_id(options, val);
    }
    match arg {
        "--resume" => set_resume_id(options, args.next()?),
        item => push_export_id(options, item),
    }
}

fn set_resume_id(options: &mut Options, client_id: &str) -> Option<()> {
    let client_id = client_id.trim();
    if options.resume.is_some() || !valid_client_id(client_id) {
        return None;
    }
    options.resume = Some(client_id.to_owned());
    Some(())
}

fn valid_combination(options: &Options) -> bool {
    options.json
        || !options.head_only
        || !(options.all
            || options.all_versions
            || options.fork_lane_new_scope
            || options.resume.is_some())
}

fn set_boolean_flag(options: &mut Options, arg: &str) -> bool {
    if set_combined_short(options, arg) {
        return true;
    }
    let (flag, val) = match arg.split_once('=') {
        Some((flag, val)) if val.trim().eq_ignore_ascii_case("true") => (flag.trim(), true),
        Some((flag, val)) if val.trim().eq_ignore_ascii_case("false") => (flag.trim(), false),
        None => (arg.trim(), true),
        _ => return false,
    };
    let slot = match flag {
        "--eject" | "-e" => &mut options.lifecycle.eject,
        "--open-browser" => &mut options.lifecycle.open_browser,
        "--all" | "-a" => &mut options.all,
        "--all-versions" => &mut options.all_versions,
        "--head-only" => &mut options.head_only,
        "--json" | "-j" => &mut options.json,
        "--verbose" => &mut options.verbose,
        "--ignore-missing-artifacts" => &mut options.ignore_missing_artifacts,
        "--origin-directly" => &mut options.origin_directly,
        "--fork-lane-new-scope" => &mut options.fork_lane_new_scope,
        _ => return false,
    };
    if *slot {
        return false;
    }
    *slot = val;
    true
}

fn set_combined_short(options: &mut Options, arg: &str) -> bool {
    if !arg.starts_with('-')
        || arg.starts_with("--")
        || arg.len() <= 2
        || !arg[1..]
            .bytes()
            .all(|byte| matches!(byte, b'e' | b'a' | b'j'))
    {
        return false;
    }
    for byte in arg[1..].bytes() {
        let slot = match byte {
            b'e' => &mut options.lifecycle.eject,
            b'a' => &mut options.all,
            _ => &mut options.json,
        };
        if *slot {
            return false;
        }
        *slot = true;
    }
    true
}

pub(super) fn is_pattern(pattern: &str) -> bool {
    !pattern.is_empty()
        && !pattern.starts_with('-')
        && pattern.contains('*')
        && !pattern.contains('\0')
}

fn valid_client_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn valid_id(id: &str) -> bool {
    if id.is_empty()
        || id.len() > 4096
        || id.contains(['*', '?', '\0'])
        || id.chars().any(char::is_whitespace)
        || id.starts_with(['-', '/', '@'])
    {
        return false;
    }
    let (identity, version) = id
        .split_once('@')
        .map_or((id, None), |(identity, version)| (identity, Some(version)));
    !identity.is_empty()
        && !identity.contains('@')
        && !identity.ends_with('/')
        && version.is_none_or(|version| !version.is_empty() && !version.contains('@'))
}

impl std::ops::Deref for Options {
    type Target = Flags;
    fn deref(&self) -> &Self::Target {
        &self.flags
    }
}
impl std::ops::DerefMut for Options {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.flags
    }
}

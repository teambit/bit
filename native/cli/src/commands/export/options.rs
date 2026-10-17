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
        if set_boolean_flag(&mut options, arg) {
            continue;
        }
        match arg {
            "--resume" if options.resume.is_none() => {
                options.resume = Some(resume_id(&mut args)?);
            }
            pattern if is_pattern(pattern) && options.ids.len() < 4096 => {
                options.ids.push(pattern.to_owned());
            }
            id if valid_id(id) && options.ids.len() < 4096 => options.ids.push(id.to_owned()),
            _ => return None,
        }
    }
    valid_combination(&options).then_some(options)
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
    let slot = match arg {
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
    *slot = true;
    true
}

pub(super) fn is_pattern(pattern: &str) -> bool {
    !pattern.is_empty()
        && !pattern.starts_with('-')
        && pattern.contains('*')
        && !pattern.contains('\0')
}

fn resume_id<'a>(args: &mut impl Iterator<Item = &'a str>) -> Option<String> {
    let client_id = args.next()?;
    valid_client_id(client_id).then(|| client_id.to_owned())
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

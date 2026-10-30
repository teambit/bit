//! `InitCmd` flags, with optional values for `--bare` and `--agent`.
use std::ffi::OsString;

#[derive(Default)]
pub(super) struct Options {
    pub path: Option<String>,
    pub bare: Option<String>,
    pub shared: Option<String>,
    pub defaults: Defaults,
    pub resets: Resets,
    pub flags: Flags,
    pub agent: Option<String>,
}
#[derive(Default)]
pub(super) struct Defaults {
    pub name: Option<String>,
    pub directory: Option<String>,
    pub scope: Option<String>,
    pub generator: Option<String>,
}
#[derive(Default)]
pub(super) struct Flags {
    pub standalone: bool,
    pub no_package_json: bool,
    pub force: bool,
    pub skip_interactive: bool,
    pub external_pm: bool,
}
#[derive(Default)]
pub(super) struct Resets {
    pub repair: bool,
    pub hard: bool,
    pub scope: bool,
    pub new: bool,
    pub lane_new: bool,
}

pub(super) fn parse(args: &[OsString]) -> Option<Options> {
    let mut options = Options::default();
    let mut args = args
        .iter()
        .skip(1)
        .map(|arg| arg.to_str())
        .peekable();
    while let Some(arg) = args.next() {
        let arg = arg?;
        if arg != "--no-color" {
            apply_arg(arg, &mut args, &mut options)?;
        }
    }
    Some(options)
}

fn apply_arg<'a>(
    arg: &'a str,
    args: &mut std::iter::Peekable<impl Iterator<Item = Option<&'a str>>>,
    options: &mut Options,
) -> Option<()> {
    match arg {
        "--bare" | "-b" => options.bare = Some(optional(args)?),
        "--agent" => options.agent = Some(optional(args)?),
        "--name" | "-n" => options.defaults.name = Some(required(args)?),
        "--default-directory" | "-d" => options.defaults.directory = Some(required(args)?),
        "--default-scope" => options.defaults.scope = Some(required(args)?),
        "--generator" => options.defaults.generator = Some(required(args)?),
        "--shared" | "-s" => options.shared = Some(required(args)?),
        value => apply_non_space_arg(value, options)?,
    }
    Some(())
}

fn apply_non_space_arg(value: &str, options: &mut Options) -> Option<()> {
    if let Some(res) = inline_option(value, options) {
        return res;
    }
    if flag(value, options) {
        return Some(());
    }
    if !value.starts_with('-') && !value.is_empty() && options.path.is_none() {
        options.path = Some(value.to_owned());
        return Some(());
    }
    None
}

fn required<'a>(args: &mut impl Iterator<Item = Option<&'a str>>) -> Option<String> {
    let val = args.next()??;
    (!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())
}

fn inline_option(arg: &str, options: &mut Options) -> Option<Option<()>> {
    let (key, val) = arg.split_once('=')?;
    match key {
        "--bare" | "-b" => {
            options.bare = Some(val.to_owned());
            Some(Some(()))
        }
        "--agent" => {
            options.agent = Some(val.to_owned());
            Some(Some(()))
        }
        "--name"
        | "-n"
        | "--default-directory"
        | "-d"
        | "--default-scope"
        | "--generator"
        | "--shared"
        | "-s" => {
            if val.is_empty() || val.starts_with('-') {
                return Some(None);
            }
            set_inline_string(key, val, options);
            Some(Some(()))
        }
        _ => None,
    }
}

fn set_inline_string(key: &str, val: &str, options: &mut Options) {
    match key {
        "--name" | "-n" => options.defaults.name = Some(val.to_owned()),
        "--default-directory" | "-d" => options.defaults.directory = Some(val.to_owned()),
        "--default-scope" => options.defaults.scope = Some(val.to_owned()),
        "--generator" => options.defaults.generator = Some(val.to_owned()),
        _ => options.shared = Some(val.to_owned()),
    }
}

fn optional<'a>(
    args: &mut std::iter::Peekable<impl Iterator<Item = Option<&'a str>>>,
) -> Option<String> {
    if args
        .peek()
        .is_some_and(|arg| arg.is_some_and(|arg| !arg.starts_with('-')))
    {
        return Some(args.next()??.to_owned());
    }
    Some(String::new())
}

fn flag(arg: &str, options: &mut Options) -> bool {
    let (key, bool_val) = match arg.split_once('=') {
        Some((key, "true")) if key.starts_with("--") => (key, true),
        Some((key, "false")) if key.starts_with("--") => (key, false),
        None => (arg, true),
        _ => return false,
    };
    let value = match key {
        "--standalone" | "-T" => &mut options.flags.standalone,
        "--no-package-json" => &mut options.flags.no_package_json,
        "--force" | "-f" => &mut options.flags.force,
        "--skip-interactive" => &mut options.flags.skip_interactive,
        "--external-package-manager" => &mut options.flags.external_pm,
        "--reset" | "-r" => &mut options.resets.repair,
        "--reset-hard" => &mut options.resets.hard,
        "--reset-scope" => &mut options.resets.scope,
        "--reset-new" => &mut options.resets.new,
        "--reset-lane-new" => &mut options.resets.lane_new,
        _ => return false,
    };
    *value = bool_val;
    true
}

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
        match arg {
            "--bare" | "-b" => options.bare = Some(optional(&mut args)?),
            "--agent" => options.agent = Some(optional(&mut args)?),
            "--name" | "-n" => options.defaults.name = Some(args.next()??.to_owned()),
            "--default-directory" | "-d" => {
                options.defaults.directory = Some(args.next()??.to_owned());
            }
            "--default-scope" => options.defaults.scope = Some(args.next()??.to_owned()),
            "--generator" => options.defaults.generator = Some(args.next()??.to_owned()),
            "--shared" | "-s" => options.shared = Some(args.next()??.to_owned()),
            value if flag(value, &mut options) => {}
            value if !value.starts_with('-') && options.path.is_none() => {
                options.path = Some(value.to_owned());
            }
            _ => return None,
        }
    }
    Some(options)
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
    let value = match arg {
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
    *value = true;
    true
}

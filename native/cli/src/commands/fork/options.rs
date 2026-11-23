//! CLI option parsing ([`Options`], [`Flags`], [`parse`]) for `bit fork` and `bit scope fork`.

/// Boolean CLI flags controlling refactoring, installation, config preservation, and linking in [`Options`] during `bit fork`.
#[derive(Default, Clone)]
pub(super) struct Flags {
    pub refactor: bool,
    pub skip_install: bool,
    pub skip_config: bool,
    pub preserve: bool,
    pub no_link: bool,
    pub ast: bool,
}
/// Parsed source/target positional arguments and [`Flags`] for `bit fork` or `bit scope fork`.
#[derive(Default)]
pub(super) struct Options {
    pub source: String,
    pub target: Option<String>,
    pub scope: Option<String>,
    pub path: Option<String>,
    pub env: Option<String>,
    pub flags: Flags,
    pub pattern: Option<String>,
    pub scope_fork: bool,
}
/// Parses `argv` into [`Options`] via [`parse_flag`] and [`assign_positions`] when they fit the native `bit fork` or `bit scope fork` grammar.
pub(super) fn parse(argv: &[&str], scope_fork: bool) -> Option<Options> {
    let mut options = Options { scope_fork, ..Options::default() };
    let mut positions = Vec::new();
    let mut arguments = argv.iter();
    while let Some(raw_arg) = arguments.next() {
        let argument = raw_arg.trim();
        if argument == "--" {
            consume_trailing_positions(arguments, &mut positions)?;
            break;
        }
        if argument.starts_with('-') {
            parse_flag(argument, &mut arguments, &mut options)?;
        } else {
            positions.push(valid_fork_val(argument)?);
        }
    }
    assign_positions(positions, &mut options)?;
    Some(options)
}
/// Assigns parsed positional arguments onto `options.source`, `options.scope`/`target`, and `options.pattern` on [`Options`].
#[inline]
fn assign_positions(positions: Vec<String>, options: &mut Options) -> Option<()> {
    let min = 1;
    let max = if options.scope_fork { 3 } else { 2 };
    if !(min..=max).contains(&positions.len()) {
        return None;
    }
    let mut iter = positions.into_iter();
    options.source = iter.next()?;
    if options.scope_fork {
        options.scope = iter.next();
        options.pattern = iter.next();
    } else {
        options.target = iter.next();
    }
    Some(())
}
/// Consumes all remaining arguments after `--` as positional fork targets.
#[inline]
fn consume_trailing_positions<'a>(
    arguments: impl Iterator<Item = &'a &'a str>,
    positions: &mut Vec<String>,
) -> Option<()> {
    for rest in arguments {
        positions.push(valid_fork_val(rest)?);
    }
    Some(())
}
/// Consumes a single flag token `argument` (and any value from `arguments`) into `options`.
fn parse_flag(
    argument: &str,
    arguments: &mut std::slice::Iter<'_, &str>,
    options: &mut Options,
) -> Option<()> {
    match argument {
        "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
        | "--color=false" | "--color=always" | "--color=never" => {}
        "--ast" | "--ast=true" => options.flags.ast = true,
        "--ast=false" => options.flags.ast = false,
        "-x" | "--skip-dependency-installation" | "--skip-dependency-installation=true" => {
            options.flags.skip_install = true;
        }
        "--skip-dependency-installation=false" => options.flags.skip_install = false,
        value if !options.scope_fork => parse_local_flag(value, arguments, options)?,
        _ => return None,
    }
    Some(())
}
/// Parses local `bit fork` flags (`--path`, `--scope`, `--env`, `--refactor`, `--preserve`, etc.) onto [`Options`].
fn parse_local_flag(
    argument: &str,
    arguments: &mut std::slice::Iter<'_, &str>,
    options: &mut Options,
) -> Option<()> {
    if let Some(handled) = parse_local_inline(argument, options) {
        return handled;
    }
    match argument {
        "-s" | "--scope" => options.scope = Some(take_fork_val(arguments)?),
        "-p" | "--path" => options.path = Some(take_fork_val(arguments)?),
        "-e" | "--env" => options.env = Some(take_fork_val(arguments)?),
        "-r" | "--refactor" | "--refactor=true" => options.flags.refactor = true,
        "--refactor=false" => options.flags.refactor = false,
        "-rx" | "-xr" => {
            options.flags.refactor = true;
            options.flags.skip_install = true;
        }
        "--skip-config" | "--skip-config=true" => options.flags.skip_config = true,
        "--skip-config=false" => options.flags.skip_config = false,
        "--preserve" | "--preserve=true" => options.flags.preserve = true,
        "--preserve=false" => options.flags.preserve = false,
        "--no-link" | "--no-link=true" => options.flags.no_link = true,
        "--no-link=false" => options.flags.no_link = false,
        _ => return None,
    }
    Some(())
}
fn parse_local_inline(argument: &str, options: &mut Options) -> Option<Option<()>> {
    if let Some(val) = argument
        .strip_prefix("--scope=")
        .or_else(|| argument.strip_prefix("-s="))
    {
        return Some(valid_fork_val(val).map(|val| options.scope = Some(val)));
    }
    if let Some(val) = argument
        .strip_prefix("--path=")
        .or_else(|| argument.strip_prefix("-p="))
    {
        return Some(valid_fork_val(val).map(|val| options.path = Some(val)));
    }
    argument
        .strip_prefix("--env=")
        .or_else(|| argument.strip_prefix("-e="))
        .map(|val| valid_fork_val(val).map(|val| options.env = Some(val)))
}
#[inline]
fn take_fork_val(arguments: &mut std::slice::Iter<'_, &str>) -> Option<String> {
    valid_fork_val(arguments.next()?)
}
#[inline]
fn valid_fork_val(val: &str) -> Option<String> {
    let trimmed = val.trim();
    (!trimmed.is_empty() && !trimmed.starts_with('-')).then(|| trimmed.to_owned())
}
impl Options {
    #[inline]
    pub fn multiple(&self) -> bool {
        let trimmed = self.source.trim();
        self.scope_fork
            || trimmed.contains(['*', '?', ',', '!', '{', '}'])
            || trimmed.starts_with('$')
    }
}

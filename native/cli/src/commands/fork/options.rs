#[derive(Default, Clone)]
pub(super) struct Flags {
    pub refactor: bool,
    pub skip_install: bool,
    pub skip_config: bool,
    pub preserve: bool,
    pub no_link: bool,
    pub ast: bool,
}
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
pub(super) fn parse(argv: &[&str], scope_fork: bool) -> Option<Options> {
    let mut options = Options {
        source: String::new(),
        target: None,
        scope: None,
        path: None,
        env: None,
        flags: Flags::default(),
        pattern: None,
        scope_fork,
    };
    let mut positions = Vec::new();
    let mut arguments = argv.iter();
    while let Some(argument) = arguments.next() {
        if argument.starts_with('-') {
            parse_flag(argument, &mut arguments, &mut options)?;
        } else {
            positions.push((*argument).to_owned());
        }
    }
    if positions.is_empty() || positions.len() > if scope_fork { 3 } else { 2 } {
        return None;
    }
    options.source = positions.remove(0);
    if scope_fork {
        options.scope = positions.first().cloned();
        options.pattern = positions.get(1).cloned();
    } else {
        options.target = positions.first().cloned();
    }
    Some(options)
}
fn parse_flag(
    argument: &str,
    arguments: &mut std::slice::Iter<'_, &str>,
    options: &mut Options,
) -> Option<()> {
    match argument {
        "--no-color" | "--ast=false" | "--skip-dependency-installation=false" => {}
        "--ast" | "--ast=true" => options.flags.ast = true,
        "-x" | "--skip-dependency-installation" | "--skip-dependency-installation=true" => {
            options.flags.skip_install = true;
        }
        value if !options.scope_fork => parse_local_flag(value, arguments, options)?,
        _ => return None,
    }
    Some(())
}
fn parse_local_flag(
    argument: &str,
    arguments: &mut std::slice::Iter<'_, &str>,
    options: &mut Options,
) -> Option<()> {
    if let Some(handled) = parse_local_inline(argument, options) {
        return handled;
    }
    match argument {
        "--refactor=false" | "--skip-config=false" | "--preserve=false" | "--no-link=false" => {}
        "-s" | "--scope" => options.scope = Some(take_fork_val(arguments)?),
        "-p" | "--path" => options.path = Some(take_fork_val(arguments)?),
        "-e" | "--env" => options.env = Some(take_fork_val(arguments)?),
        "-r" | "--refactor" | "--refactor=true" => options.flags.refactor = true,
        "-rx" | "-xr" => {
            options.flags.refactor = true;
            options.flags.skip_install = true;
        }
        "--skip-config" | "--skip-config=true" => options.flags.skip_config = true,
        "--preserve" | "--preserve=true" => options.flags.preserve = true,
        "--no-link" | "--no-link=true" => options.flags.no_link = true,
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
fn take_fork_val(arguments: &mut std::slice::Iter<'_, &str>) -> Option<String> {
    valid_fork_val(arguments.next()?)
}
fn valid_fork_val(val: &str) -> Option<String> {
    (!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())
}
impl Options {
    pub fn multiple(&self) -> bool {
        self.scope_fork || self.source.contains(['*', '?', ','])
    }
}

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
        "--ast" => options.flags.ast = true,
        "-x" | "--skip-dependency-installation" => options.flags.skip_install = true,
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
    match argument {
        "-s" | "--scope" => options.scope = Some((*arguments.next()?).into()),
        "-p" | "--path" => options.path = Some((*arguments.next()?).into()),
        "-e" | "--env" => options.env = Some((*arguments.next()?).into()),
        "-r" | "--refactor" => options.flags.refactor = true,
        "--skip-config" => options.flags.skip_config = true,
        "--preserve" => options.flags.preserve = true,
        "--no-link" => options.flags.no_link = true,
        _ => return None,
    }
    Some(())
}
impl Options {
    pub fn multiple(&self) -> bool {
        self.scope_fork || self.source.contains(['*', '?', ','])
    }
}

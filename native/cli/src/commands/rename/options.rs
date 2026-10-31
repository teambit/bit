use bit_object_import::component_rename::Options;

pub(super) fn parse(argv: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut positions = Vec::new();
    let mut arguments = argv.iter().copied();
    while let Some(argument) = arguments.next() {
        if argument == "--" {
            consume_trailing_positions(arguments, &mut positions)?;
            break;
        }
        apply_rename_arg(argument, &mut arguments, &mut options, &mut positions)?;
    }
    let [source, target]: [String; 2] = positions.try_into().ok()?;
    options.source = source;
    options.target = target;
    Some(options)
}

fn consume_trailing_positions<'a>(
    arguments: impl Iterator<Item = &'a str>,
    positions: &mut Vec<String>,
) -> Option<()> {
    for rest in arguments {
        positions.push(take_val(rest)?);
    }
    Some(())
}

fn apply_rename_arg<'a>(
    argument: &'a str,
    arguments: &mut impl Iterator<Item = &'a str>,
    options: &mut Options,
    positions: &mut Vec<String>,
) -> Option<()> {
    match argument {
        "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
        | "--color=false" | "--color=always" | "--color=never" | "--delete" | "--delete=true"
        | "--delete=false" => {}
        "-s" | "--scope" => options.scope = Some(take_val(arguments.next()?)?),
        "-p" | "--path" => options.path = Some(take_val(arguments.next()?)?),
        "-r" | "--refactor" | "--refactor=true" => options.refactor = true,
        "--refactor=false" => options.refactor = false,
        "--preserve" | "--preserve=true" => options.preserve = true,
        "--preserve=false" => options.preserve = false,
        "--deprecate" | "--deprecate=true" => options.deprecate = true,
        "--deprecate=false" => options.deprecate = false,
        "--ast" | "--ast=true" => options.ast = true,
        "--ast=false" => options.ast = false,
        _ => apply_inline_or_positional(argument, options, positions)?,
    }
    Some(())
}

fn apply_inline_or_positional(
    argument: &str,
    options: &mut Options,
    positions: &mut Vec<String>,
) -> Option<()> {
    if let Some(val) = argument
        .strip_prefix("--scope=")
        .or_else(|| argument.strip_prefix("-s="))
    {
        options.scope = Some(take_val(val)?);
    } else if let Some(val) = argument
        .strip_prefix("--path=")
        .or_else(|| argument.strip_prefix("-p="))
    {
        options.path = Some(take_val(val)?);
    } else if !argument.trim().starts_with('-') && !argument.trim().is_empty() {
        positions.push(argument.trim().to_owned());
    } else {
        return None;
    }
    Some(())
}

fn take_val(val: &str) -> Option<String> {
    let trimmed = val.trim();
    (!trimmed.is_empty() && !trimmed.starts_with('-')).then(|| trimmed.to_owned())
}

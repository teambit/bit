//! Command-line flag and positional argument parser for `bit rename`.
//!
//! [`parse`], [`apply_rename_arg`], and [`consume_trailing_positions`] validate `bit rename <current-name> <new-name>` flags into [`Options`].
use bit_object_import::component_rename::Options;

/// Parses `bit rename <current-name> <new-name>` CLI tokens into [`Options`].
pub(super) fn parse(argv: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut positions = Vec::with_capacity(2);
    let mut arguments = argv.iter().copied();
    while let Some(raw_argument) = arguments.next() {
        let argument = raw_argument.trim();
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

/// Appends post-`--` positional arguments to `positions` after validating each token.
#[inline]
fn consume_trailing_positions<'a>(
    arguments: impl Iterator<Item = &'a str>,
    positions: &mut Vec<String>,
) -> Option<()> {
    for rest in arguments {
        positions.push(take_val(rest)?);
    }
    Some(())
}

/// Applies a single `bit rename` flag or positional component name onto `options` and `positions`.
fn apply_rename_arg<'a>(
    argument: &'a str,
    arguments: &mut impl Iterator<Item = &'a str>,
    options: &mut Options,
    positions: &mut Vec<String>,
) -> Option<()> {
    match argument {
        "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
        | "--color=false" | "--color=always" | "--color=never" | "-d" | "--delete"
        | "--delete=true" | "--delete=false" => {}
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

/// Applies an inline `--scope=`/`--path=` flag or positional component token onto `options` and `positions`.
#[inline]
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
    } else if !argument.starts_with('-') {
        positions.push(take_val(argument)?);
    } else {
        return None;
    }
    Some(())
}

/// Strips surrounding whitespace and quotes from `val` and validates that it is a non-flag argument token for [`parse`] and [`apply_rename_arg`].
#[inline]
fn take_val(val: &str) -> Option<String> {
    let trimmed = val
        .trim()
        .trim_matches(['"', '\''])
        .trim();
    (!trimmed.is_empty()
        && trimmed.len() <= 4096
        && !trimmed.starts_with('-')
        && !trimmed.contains('\0'))
    .then(|| trimmed.to_owned())
}

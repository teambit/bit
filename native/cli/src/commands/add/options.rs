//! Published `AddCmd` [`Options`] flags, preserving yargs string-valued override semantics.
//!
//! Parses CLI arguments into [`Tracking`] options, environment overrides, and `--json` mode via [`parse`].
use bit_object_import::component_tracking::Options as Tracking;
use serde_json::json;
/// Parsed `bit add` CLI options, including [`Tracking`] parameters, `--env`, and `--json`.
pub(super) struct Options {
    pub tracking: Tracking,
    pub env: Option<String>,
    pub json: bool,
}
pub(super) fn parse(args: &[&str]) -> Option<Options> {
    let mut options = Options {
        tracking: Tracking { config: json!({}), ..Default::default() },
        env: None,
        json: false,
    };
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        if *arg == "--" {
            for item in args {
                is_valid_value(item).then_some(())?;
                options.tracking.paths.push((*item).to_owned());
            }
            break;
        }
        apply_arg(&mut options, arg, &mut args)?;
    }
    Some(options)
}

fn apply_arg(
    options: &mut Options,
    arg: &str,
    args: &mut std::slice::Iter<'_, &str>,
) -> Option<()> {
    if consume_value(options, arg, args)? {
        return Some(());
    }
    match arg {
        "--no-color" | "--no-color=true" | "--no-color=false" => {}
        "-o" | "--override" if !options.tracking.override_files => {
            let _ = value(args)?;
            options.tracking.override_files = true;
        }
        "--root" | "--root=true" => options.tracking.workspace_root = true,
        "--root=false" => options.tracking.workspace_root = false,
        "-j" | "--json" | "--json=true" => options.json = true,
        "--json=false" => options.json = false,
        path if is_valid_value(path) => {
            options.tracking.paths.push(path.to_owned());
        }
        _ => return None,
    }
    Some(())
}

fn consume_value(
    options: &mut Options,
    arg: &str,
    args: &mut std::slice::Iter<'_, &str>,
) -> Option<bool> {
    if let Some(handled) = consume_inline_value(options, arg) {
        return handled;
    }
    let Some(slot) = string_option(options, arg) else {
        return Some(false);
    };
    if slot.is_some() {
        return None;
    }
    *slot = Some(value(args)?);
    Some(true)
}

fn consume_inline_value(options: &mut Options, arg: &str) -> Option<Option<bool>> {
    if let Some(val) = arg
        .strip_prefix("--override=")
        .or_else(|| arg.strip_prefix("-o="))
    {
        if options.tracking.override_files || !is_valid_value(val) {
            return Some(None);
        }
        options.tracking.override_files = true;
        return Some(Some(true));
    }
    let (flag, inline) = arg.split_once('=')?;
    let slot = string_option(options, flag)?;
    if slot.is_some() || !is_valid_value(inline) {
        return Some(None);
    }
    *slot = Some(inline.to_owned());
    Some(Some(true))
}
#[inline]
fn string_option<'a>(options: &'a mut Options, arg: &str) -> Option<&'a mut Option<String>> {
    match arg {
        "-i" | "--id" => Some(&mut options.tracking.id),
        "-m" | "--main" => Some(&mut options.tracking.main),
        "-n" | "--namespace" => Some(&mut options.tracking.namespace),
        "-s" | "--scope" => Some(&mut options.tracking.scope),
        "-e" | "--env" => Some(&mut options.env),
        _ => None,
    }
}
#[inline]
fn value(args: &mut std::slice::Iter<'_, &str>) -> Option<String> {
    args.next()
        .copied()
        .filter(|arg| is_valid_value(arg))
        .map(str::to_owned)
}
#[inline]
fn is_valid_value(val: &str) -> bool {
    !val.trim().is_empty() && !val.starts_with('-')
}

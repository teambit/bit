//! Published `AddCmd` flags, preserving yargs string-valued override semantics.
use bit_object_import::component_tracking::Options as Tracking;
use serde_json::json;
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
            options.tracking.paths.extend(args.map(|item| (*item).to_owned()));
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
        "--no-color" => {}
        "-o" | "--override" if !options.tracking.override_files => {
            let _ = value(args)?;
            options.tracking.override_files = true;
        }
        "--root" | "--root=true" if !options.tracking.workspace_root => {
            options.tracking.workspace_root = true;
        }
        "--root=false" if !options.tracking.workspace_root => {}
        "-j" | "--json" | "--json=true" if !options.json => options.json = true,
        "--json=false" if !options.json => {}
        path if !path.starts_with('-') => options.tracking.paths.push(path.to_owned()),
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
    if let Some(val) = arg.strip_prefix("--override=") {
        if options.tracking.override_files || val.is_empty() || val.starts_with('-') {
            return Some(None);
        }
        options.tracking.override_files = true;
        return Some(Some(true));
    }
    let (flag, inline) = arg.split_once('=')?;
    let slot = string_option(options, flag)?;
    if slot.is_some() || inline.is_empty() || inline.starts_with('-') {
        return Some(None);
    }
    *slot = Some(inline.to_owned());
    Some(Some(true))
}
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
fn value(args: &mut std::slice::Iter<'_, &str>) -> Option<String> {
    args.next()
        .filter(|arg| !arg.is_empty() && !arg.starts_with('-'))
        .map(|value| (*value).to_owned())
}

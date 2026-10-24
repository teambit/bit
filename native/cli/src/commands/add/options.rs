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
        if consume_value(&mut options, arg, &mut args)? {
            continue;
        }
        match *arg {
            "-o" | "--override" if !options.tracking.override_files => {
                let _ = value(&mut args)?;
                options.tracking.override_files = true;
            }
            "--root" if !options.tracking.workspace_root => options.tracking.workspace_root = true,
            "-j" | "--json" if !options.json => options.json = true,
            "--" => {
                options.tracking.paths.extend(args.map(|arg| (*arg).to_owned()));
                break;
            }
            path if !path.starts_with('-') => options.tracking.paths.push(path.to_owned()),
            _ => return None,
        }
    }
    Some(options)
}
fn consume_value(
    options: &mut Options,
    arg: &str,
    args: &mut std::slice::Iter<'_, &str>,
) -> Option<bool> {
    let Some(slot) = string_option(options, arg) else {
        return Some(false);
    };
    if slot.is_some() {
        return None;
    }
    *slot = Some(value(args)?);
    Some(true)
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

//! Switch-specific argument checks precede lane lookup and remote acquisition.
use super::{Prepare, invalid};
use std::io;

pub(in super::super) fn options(request: &Prepare) -> io::Result<()> {
    let options = request.options.lane.as_ref().ok_or_else(|| invalid("switch lane missing"))?;
    if request.options.strategy
        .as_deref()
        .is_some_and(|value| !matches!(value, "ours" | "theirs" | "manual"))
    {
        return Err(canonical("merge must be one of the following: ours, theirs, manual".into()));
    }
    if let Some(alias) = options.alias
        .as_deref()
        .filter(|alias| !alias.is_empty())
    {
        validate_alias(alias)?;
    }
    if request.options.force_ours && request.options.force_theirs {
        return Err(canonical("please use either --force-ours or --force-theirs, not both".into()));
    }
    let checkout = request.options.to.is_some()
        || request.options.pattern.is_some()
        || request.options.message.is_some()
        || request.options.all
        || request.options.no_snap;
    let lane = options.include_deps || options.exclude_non_lane_comps || options.no_auto_snap;
    if checkout || lane || options.no_squash || options.squash {
        return Err(invalid("switch requires canonical lane options"));
    }
    Ok(())
}
fn validate_alias(alias: &str) -> io::Result<()> {
    if alias.len() > 800
        || !alias
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"-_!$".contains(&byte)
            })
    {
        return Err(canonical(format!(
            r#"lane "{alias}" has invalid characters. lane name can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]"#,
        )));
    }
    Ok(())
}
pub(super) fn canonical(message: String) -> io::Error {
    crate::workspace::engine::response::canonical(message)
}

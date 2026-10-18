//! `ImportCmd.importComponents` validates these known modes after provider startup.
use super::Options;

pub(super) fn error(options: &Options) -> Option<&'static str> {
    directories(options).or_else(|| missing_ids(options))
}
fn directories(options: &Options) -> Option<&'static str> {
    if !options.write.adoption.write_to_empty_dir {
        return None;
    }
    if options.write.override_existing {
        return Some("--override and --write-to-empty-dir cannot be used together");
    }
    options.write.path.as_ref().map(|_| "--path and --write-to-empty-dir cannot be used together")
}
fn missing_ids(options: &Options) -> Option<&'static str> {
    if !options.ids.is_empty() {
        return None;
    }
    let dependents = &options.selection.dependents;
    if dependents.enabled {
        return Some(r#"you have to specify ids to use "--dependents" flag"#);
    }
    if dependents.via.is_some() {
        return Some(r#"you have to specify ids to use "--dependents-via" flag"#);
    }
    options.write.adoption.track_only.then_some(
        r#"you have to specify ids to use "--track-only" flag"#,
    )
}

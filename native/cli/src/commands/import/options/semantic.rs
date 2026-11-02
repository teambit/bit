//! `ImportCmd.importComponents` validates these known modes after provider startup.
//!
//! [`error`] returns the first incompatible flag combination diagnostic ([`directories`], [`missing_ids`], [`dependencies_depth`]) for [`Options`].
use super::Options;

/// Returns the first user-facing semantic validation error for `options`, if any.
#[inline]
pub(super) fn error(options: &Options) -> Option<String> {
    directories(options)
        .or_else(|| missing_ids(options))
        .map(str::to_owned)
        .or_else(|| dependencies_depth(options))
}
/// Checks for mutually exclusive `--write-to-empty-dir` and `--override` or `--path` flags.
#[inline]
fn directories(options: &Options) -> Option<&'static str> {
    if !options.write.adoption.write_to_empty_dir {
        return None;
    }
    if options.write.override_existing {
        return Some("--override and --write-to-empty-dir cannot be used together");
    }
    options.write.path
        .as_deref()
        .is_some_and(|path| !path.trim().is_empty())
        .then_some("--path and --write-to-empty-dir cannot be used together")
}
/// Checks for flags (`--dependencies`, `--dependents`, `--track-only`, etc.) that require explicit component IDs.
#[inline]
fn missing_ids(options: &Options) -> Option<&'static str> {
    if options.ids
        .iter()
        .any(|id| !id.trim().is_empty())
    {
        return None;
    }
    if options.write.dependencies.import_dependencies {
        return Some(r#"you have to specify ids to use "--dependencies" flag"#);
    }
    if options.write.dependencies.import_head_dependencies {
        return Some(r#"you have to specify ids to use "--dependencies-head" flag"#);
    }
    let dependents = &options.selection.dependents;
    if dependents.enabled {
        return Some(r#"you have to specify ids to use "--dependents" flag"#);
    }
    if dependents.via
        .as_deref()
        .is_some_and(|via| {
            via.split(',')
                .any(|item| !item.trim().is_empty())
        })
    {
        return Some(r#"you have to specify ids to use "--dependents-via" flag"#);
    }
    options.write.adoption.track_only.then_some(
        r#"you have to specify ids to use "--track-only" flag"#,
    )
}
/// Validates `--dependencies-depth` against `--dependencies` and `--dependencies-head` in `options`.
#[inline]
fn dependencies_depth(options: &Options) -> Option<String> {
    let raw = options.write.dependencies.raw_depth.as_deref()?.trim();
    if !has_dependency_import_flag(options) {
        return Some(
            r#""--dependencies-depth" flag requires "--dependencies" or "--dependencies-head""#
                .to_owned(),
        );
    }
    options.write.dependencies.depth
        .is_none()
        .then(|| format!(r#""--dependencies-depth" must be a positive integer, got "{raw}""#))
}

/// Returns whether `--dependencies` or `--dependencies-head` is enabled in `options`.
#[inline]
const fn has_dependency_import_flag(options: &Options) -> bool {
    options.write.dependencies.import_dependencies
        || options.write.dependencies.import_head_dependencies
}

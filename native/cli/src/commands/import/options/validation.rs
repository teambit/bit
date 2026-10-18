use super::{DependencyOptions, has_wildcard, valid_import_flags, valid_pattern};

pub(super) fn args(flags: &[&str], ids: &[String]) -> bool {
    valid_import_flags(flags)
        && (!flags.contains(&"--lane-only") || ids.iter().any(|id| has_wildcard(id)))
        && !ids
            .iter()
            .any(|id| has_wildcard(id) && !valid_pattern(id))
}

pub(super) fn mode(
    dependencies: &DependencyOptions,
    ids: &[String],
    objects_only: bool,
    override_existing: bool,
    merge_strategy: Option<&str>,
    path: Option<&str>,
) -> bool {
    valid_dependencies(dependencies, ids, objects_only, override_existing, merge_strategy, path)
        && valid_merge_mode(merge_strategy, ids, objects_only, override_existing)
        && (!override_existing || !objects_only)
        && valid_path(path, ids, objects_only)
}

fn valid_dependencies(
    options: &DependencyOptions,
    ids: &[String],
    objects_only: bool,
    override_existing: bool,
    merge_strategy: Option<&str>,
    path: Option<&str>,
) -> bool {
    let enabled = options.import_dependencies || options.import_head_dependencies;
    if options.import_dependencies && options.import_head_dependencies
        || options.depth.is_some() && !enabled
    {
        return false;
    }
    !enabled
        || !objects_only
            && !ids.is_empty()
            && !override_existing
            && merge_strategy.is_none()
            && path.is_none()
}

fn valid_merge_mode(
    strategy: Option<&str>,
    ids: &[String],
    objects_only: bool,
    override_existing: bool,
) -> bool {
    strategy.is_none() || !objects_only && ids.len() == 1 && !override_existing
}

fn valid_path(path: Option<&str>, ids: &[String], objects_only: bool) -> bool {
    path.is_none() || !objects_only && ids.len() == 1 && !has_wildcard(&ids[0])
}

use super::{DependencyOptions, WriteOptions, has_wildcard, valid_import_flags, valid_pattern};

pub(super) fn args(flags: &[&str], ids: &[String]) -> bool {
    valid_import_flags(flags)
        && (!flags.contains(&"--lane-only") || ids.iter().any(|id| has_wildcard(id)))
        && !ids
            .iter()
            .any(|id| has_wildcard(id) && !valid_pattern(id))
}

pub(super) fn mode(
    write: &WriteOptions,
    ids: &[String],
    objects_only: bool,
    explicit_objects: bool,
) -> bool {
    let path = write.path.as_deref();
    valid_dependencies(
        &write.dependencies,
        ids,
        objects_only,
        write.override_existing,
        write.merge,
        path,
    ) && valid_merge_mode(
        write.merge,
        write.merge_strategy.as_deref(),
        ids,
        explicit_objects,
        write.override_existing,
    ) && (!write.override_existing || !explicit_objects)
        && valid_path(path, ids, objects_only)
}

fn valid_dependencies(
    options: &DependencyOptions,
    ids: &[String],
    objects_only: bool,
    override_existing: bool,
    merge: bool,
    path: Option<&str>,
) -> bool {
    let enabled = options.import_dependencies || options.import_head_dependencies;
    if options.import_dependencies && options.import_head_dependencies {
        return false;
    }
    let active = enabled || options.raw_depth.is_some();
    !active
        || (!objects_only && !ids.is_empty() && !override_existing && !merge && path.is_none())
        || (ids.is_empty() && enabled && options.raw_depth.is_none())
}

fn valid_merge_mode(
    merge: bool,
    strategy: Option<&str>,
    ids: &[String],
    explicit_objects: bool,
    override_existing: bool,
) -> bool {
    if !merge {
        return true;
    }
    if explicit_objects || override_existing {
        return false;
    }
    if ids.is_empty() {
        return true;
    }
    strategy.is_some() && ids.len() == 1
}

fn valid_path(path: Option<&str>, ids: &[String], objects_only: bool) -> bool {
    path.is_none() || !objects_only && ids.len() == 1 && !has_wildcard(&ids[0])
}

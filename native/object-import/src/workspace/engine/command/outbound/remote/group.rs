//! `Repository.getChownOptions`: configured Unix group ownership for pending objects.

#[cfg(all(test, unix))]
mod tests;
use serde_json::Value;
use std::{fs, io, path::Path};

#[inline]
pub(super) fn id(config: &Value) -> io::Result<Option<u32>> {
    let Some(name) = name(config)? else { return Ok(None) };
    #[cfg(unix)]
    {
        let bytes =
            crate::read_budget::Budget::new(8 * 1024 * 1024).read(fs::File::open("/etc/group")?)?;
        let groups = String::from_utf8_lossy(&bytes);
        parse(&groups, name)
    }
    #[cfg(not(unix))]
    {
        let _ = name;
        Ok(None)
    }
}

#[inline]
fn name(config: &Value) -> io::Result<Option<&str>> {
    if !config.is_object() {
        return Err(io::Error::other("unsupported file remote group configuration"));
    }
    match &config["groupName"] {
        Value::Null | Value::Bool(false) => Ok(None),
        Value::String(name) => {
            let trimmed = name.trim();
            if trimmed.contains(':') || trimmed.chars().any(char::is_control) {
                return Err(io::Error::other("unsupported file remote group configuration"));
            }
            Ok((!trimmed.is_empty()).then_some(trimmed))
        }
        Value::Number(number) if number.as_f64() == Some(0.0) => Ok(None),
        _ => Err(io::Error::other("unsupported file remote group configuration")),
    }
}

pub(super) fn owner(scope: &Path, pending: &Path) -> io::Result<Option<(u32, u32)>> {
    let config: Value = crate::parse_jsonc(&fs::read(scope.join("scope.json"))?)?;
    let Some(gid) = id(&config)? else { return Ok(None) };
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Ok(Some((fs::metadata(pending)?.uid(), gid)))
    }
    #[cfg(not(unix))]
    {
        let _ = (pending, gid);
        Ok(None)
    }
}

#[cfg(unix)]
fn parse(groups: &str, name: &str) -> io::Result<Option<u32>> {
    let name = name.trim();
    let raw_gid = groups
        .lines()
        .map(str::trim)
        .filter(|row| !row.is_empty() && !row.starts_with('#'))
        .find_map(|row| {
            let mut fields = row.split(':');
            (fields.next().map(str::trim) == Some(name)).then(|| {
                fields.nth(1).unwrap_or_default().trim()
            })
        })
        .ok_or_else(|| {
            io::Error::other(format!(
                r#"unable to resolve group id of "{name}", the group does not exist"#,
            ))
        })?;
    let gid = raw_gid
        .parse::<u32>()
        .map_err(|_| {
            io::Error::other(format!(
                r#"unable to resolve group id of "{name}", got an error parsing /etc/group"#,
            ))
        })?;
    // JavaScript's `gid ? {...} : null` leaves group zero without an override.
    Ok((gid != 0).then_some(gid))
}

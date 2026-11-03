//! `package-name-utils.ts`: [`extract_package_name`] (`extractPackageName`) and `isValidPackageName`
//! (`validate-npm-package-name`'s `validForOldPackages` check).
//!
//! Strips version specifiers outside [`ALLOWED_PREFIXES`] and validates package names against [`BLOCKLIST`].

/// Protocol prefixes (`https://`, `git:`, `file:`, `link:`, `workspace:`, etc.) preserved verbatim by [`extract_package_name`].
const ALLOWED_PREFIXES: [&str; 8] =
    ["https://", "http://", "git:", "git+ssh://", "git+https://", "file:", "link:", "workspace:"];
/// Reserved npm package names (`node_modules`, `favicon.ico`) rejected by [`is_valid_package_name`] and skipped by [`extract_package_name`].
const BLOCKLIST: [&str; 2] = ["node_modules", "favicon.ico"];

/// The package name of an install argument, without its version or tag.
#[inline]
#[must_use]
pub fn extract_package_name(argument: &str) -> String {
    let argument = argument.trim();
    if ALLOWED_PREFIXES
        .iter()
        .any(|prefix| {
            argument
                .get(..prefix.len())
                .is_some_and(|head| head.eq_ignore_ascii_case(prefix))
        })
    {
        return argument.to_string();
    }
    if let Some(rest) = argument.strip_prefix('@') {
        let Some(at) = rest.find('@') else { return argument.to_string() };
        if rest[at + 1..].contains('/') {
            return argument.to_string();
        }
        return argument[..=at].trim().to_string();
    }
    match argument.rfind('@') {
        Some(at) if at > 0 => argument[..at].trim().to_string(),
        _ => argument.to_string(),
    }
}

/// Whether `name` can be installed from a registry (`validForOldPackages`).
#[inline]
#[must_use]
pub fn is_valid_package_name(name: &str) -> bool {
    if name.is_empty() || name.starts_with(['.', '_']) || name.trim() != name {
        return false;
    }
    if BLOCKLIST
        .iter()
        .any(|blocked| name.eq_ignore_ascii_case(blocked))
    {
        return false;
    }
    if is_url_safe(name) {
        return true;
    }
    scoped_parts(name).is_some_and(|(user, package)| is_url_safe(user) && is_url_safe(package))
}

/// Split a scoped `@<user>/<package>` name into `(user, package)` (`/^(?:@([^/]+?)\/)?([^/]+?)$/`) for [`is_valid_package_name`].
#[inline]
fn scoped_parts(name: &str) -> Option<(&str, &str)> {
    let (user, package) = name.strip_prefix('@')?.split_once('/')?;
    (!user.is_empty()
        && !package.is_empty()
        && !package.starts_with(['.', '_'])
        && !package.contains('/'))
    .then_some((user, package))
}

/// Return `true` when `part` satisfies `encodeURIComponent(part) === part`.
#[inline]
fn is_url_safe(part: &str) -> bool {
    !part.is_empty()
        && part
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_.!~*'()".contains(character))
}

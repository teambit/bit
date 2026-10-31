//! `package-name-utils.ts`: `extractPackageName` and `isValidPackageName`
//! (`validate-npm-package-name`'s `validForOldPackages`).

const ALLOWED_PREFIXES: [&str; 8] =
    ["https://", "http://", "git:", "git+ssh://", "git+https://", "file:", "link:", "workspace:"];
const BLOCKLIST: [&str; 2] = ["node_modules", "favicon.ico"];

/// The package name of an install argument, without its version or tag.
#[must_use]
pub fn extract_package_name(argument: &str) -> String {
    let argument = argument.trim();
    if ALLOWED_PREFIXES
        .iter()
        .any(|prefix| argument.starts_with(prefix))
    {
        return argument.to_string();
    }
    if let Some(rest) = argument.strip_prefix('@') {
        let Some(at) = rest.find('@') else { return argument.to_string() };
        if rest[at + 1..].contains('/') {
            return argument.to_string();
        }
        return argument[..=at].to_string();
    }
    match argument.rfind('@') {
        Some(at) if at > 0 => argument[..at].to_string(),
        _ => argument.to_string(),
    }
}

/// Whether `name` can be installed from a registry (`validForOldPackages`).
#[must_use]
pub fn is_valid_package_name(name: &str) -> bool {
    if name.is_empty() || name.starts_with(['.', '_']) || name.trim() != name {
        return false;
    }
    if BLOCKLIST.contains(&name.to_lowercase().as_str()) {
        return false;
    }
    if is_url_safe(name) {
        return true;
    }
    scoped_parts(name).is_some_and(|(user, package)| is_url_safe(user) && is_url_safe(package))
}

/// `/^(?:@([^/]+?)\/)?([^/]+?)$/` for a scoped name.
fn scoped_parts(name: &str) -> Option<(&str, &str)> {
    let (user, package) = name.strip_prefix('@')?.split_once('/')?;
    (!user.is_empty() && !package.is_empty() && !package.contains('/')).then_some((user, package))
}

/// `encodeURIComponent(part) === part`.
fn is_url_safe(part: &str) -> bool {
    part.chars()
        .all(|character| character.is_ascii_alphanumeric() || "-_.!~*'()".contains(character))
}

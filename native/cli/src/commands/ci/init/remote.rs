//! Git remote interpretation used only to render the onboarding checklist.
use reqwest::Url;
use std::env;

pub(super) struct Repository {
    pub owner: String,
    pub name: String,
    pub host: String,
}
impl Repository {
    pub(super) fn display(&self) -> String {
        let repo = format!("{}/{}", self.owner.trim(), self.name.trim());
        let host = self.host.trim();
        if host.eq_ignore_ascii_case("github.com") { repo } else { format!("{host}/{repo}") }
    }
}
fn server() -> Option<Url> {
    env::var("GITHUB_SERVER_URL")
        .ok()
        .and_then(|value| Url::parse(super::trim(&value)).ok())
}
fn capture(value: &str, pattern: &str, group: usize) -> Option<String> {
    let found = regress::Regex::with_flags(pattern, "i").ok()?.find(value)?;
    Some(value[found.group(group)?].to_owned())
}
pub(super) fn host(remote: &str) -> Option<String> {
    capture(super::trim(remote), r"^(?:[a-z+]+://)?(?:[^@/]+@)?([^:/]+)", 1)
        .map(|value| value.to_lowercase())
}
pub(super) fn repository(remote: &str) -> Option<Repository> {
    let remote = super::trim(remote);
    let host = host(remote)?;
    let matches_server = server()
        .as_ref()
        .and_then(Url::host_str)
        .is_some_and(|srv| srv.eq_ignore_ascii_case(&host));
    if !host.eq_ignore_ascii_case("github.com") && !matches_server {
        return None;
    }
    let escaped = host
        .chars()
        .fold(String::new(), |mut out, ch| {
            if r".*+?^${}()|[]\".contains(ch) {
                out.push('\\');
            }
            out.push(ch);
            out
        });
    let scheme = regress::Regex::with_flags(r"^[a-z+]+://", "i")
        .ok()
        .is_some_and(|regex| regex.find(remote).is_some());
    let pattern = if scheme {
        format!(r"(?://|@){escaped}(?::\d+)?/([^/]+/[^/]+?)(?:\.git)?$")
    } else {
        format!(r"(?:^|@){escaped}[:/]([^/]+/[^/]+?)(?:\.git)?$")
    };
    let repo = capture(remote, &pattern, 1)?;
    parse_repository(&repo, host)
}
fn parse_repository(repo: &str, host: String) -> Option<Repository> {
    let (owner, name) = repo
        .split_once('/')
        .map(|(owner, name)| (owner.trim(), name.trim()))
        .filter(|(owner, name)| !owner.is_empty() && !name.is_empty())?;
    Some(Repository { owner: owner.into(), name: name.into(), host })
}
pub(super) fn local(remote: &str) -> bool {
    let value = super::trim(remote);
    let matches = |expression| {
        regress::Regex::with_flags(expression, "i")
            .ok()
            .is_some_and(|regex| regex.find(value).is_some())
    };
    if matches(r"^file://") {
        return true;
    }
    if matches(r"^[a-z][a-z0-9+.-]*://") {
        return false;
    }
    if matches(r"^[a-z]:[/\\]") {
        return true;
    }
    !matches(r"^[^/\\]+:")
}
pub(super) fn redacted(remote: &str) -> String {
    let value = super::trim(remote);
    let https = regress::Regex::with_flags(r"^https?://", "i")
        .ok()
        .is_some_and(|regex| regex.find(value).is_some());
    let pattern =
        if https { r"^(https?://)[^@/]*@" } else { r"^([a-z][a-z0-9+.-]*://[^:@/]*):[^@/]*@" };
    let Some(found) = regress::Regex::with_flags(pattern, "i")
        .ok()
        .and_then(|regex| regex.find(value))
    else {
        return value.into();
    };
    let Some(group) = found.group(1) else {
        return value.into();
    };
    let prefix = &value[group];
    format!("{prefix}{}{}", if https { "" } else { "@" }, &value[found.range.end..])
}
pub(super) fn inert(value: &str) -> String {
    value
        .chars()
        .fold(String::new(), |mut out, ch| {
            if ch <= '\u{1f}' || ('\u{7f}'..='\u{9f}').contains(&ch) {
                use std::fmt::Write;
                let _ = write!(out, r"\x{:02x}", u32::from(ch));
            } else {
                out.push(ch);
            }
            out
        })
}
pub(super) fn suggested(remote: &str) -> String {
    if let Ok(url) = Url::parse(super::trim(remote))
        && matches!(url.scheme(), "http" | "https")
    {
        return url.origin().ascii_serialization();
    }
    format!("https://{}", host(remote).as_deref().unwrap_or("<your-server>"))
}
pub(super) fn api(host: &str) -> Result<String, String> {
    let Some(server) = server() else {
        return Ok("https://api.github.com".into());
    };
    let server_host = server.host_str().unwrap_or("github.com");
    if server_host == "github.com" || !host.trim().eq_ignore_ascii_case(server_host) {
        return Ok("https://api.github.com".into());
    }
    if !matches!(server.scheme(), "http" | "https") {
        return Err(refuse("GITHUB_SERVER_URL is not an http(s) URL"));
    }
    let Some(raw) = env::var("GITHUB_API_URL")
        .ok()
        .map(|value| super::trim(&value).to_owned())
        .filter(|value| !value.is_empty())
    else {
        return Ok(format!("{}/api/v3", server.origin().ascii_serialization()));
    };
    api_override(&server, &raw)
}
fn refuse(why: &str) -> String {
    format!(
        r#"{why} — refusing to send the token of the GITHUB_SERVER_URL instance "{}" to it"#,
        env::var("GITHUB_SERVER_URL").unwrap_or_default(),
    )
}
fn api_override(server: &Url, raw: &str) -> Result<String, String> {
    let raw = super::trim(raw);
    let server_host = server.host_str().unwrap_or("github.com");
    let Some(api) = Url::parse(raw)
        .ok()
        .filter(|api| {
            api.host_str()
                .is_some_and(|host| {
                    host.eq_ignore_ascii_case(server_host)
                        || host.eq_ignore_ascii_case(&format!("api.{server_host}"))
                })
        })
    else {
        return Err(refuse(&format!(
            r#"GITHUB_API_URL "{raw}" is not on {server_host} or api.{server_host}"#,
        )));
    };
    let secure = server.scheme() == "https";
    if api.scheme() != "https" && (secure || api.scheme() != "http") {
        return Err(refuse(&format!(
            r#"GITHUB_API_URL "{raw}" is not {}"#,
            if secure { "https" } else { "http or https" },
        )));
    }
    if api
        .query()
        .is_some_and(|value| !value.is_empty())
        || api
            .fragment()
            .is_some_and(|value| !value.is_empty())
    {
        return Err(refuse(&format!(r#"GITHUB_API_URL "{raw}" carries a query or fragment"#)));
    }
    Ok(raw.trim_end_matches('/').into())
}

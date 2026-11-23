//! `PnpmPackageManager.getNetworkConfig`: without a configured `userAgent`,
//! the engine identifies as `bit user/<username>`, the username coming from
//! Bit Cloud (`CloudMain.getCurrentUser`) and `anonymous` when the cloud does
//! not answer. `fetchFromSymphonyViaGQL` uses a plain `fetch`, so no proxy or
//! TLS setting applies here either.
//!
//! Enforces a 5-second timeout ([`LOOKUP_TIMEOUT`]) on the `GraphQL` user lookup via [`cloud_username`] and [`apply_cloud_username`].

#[cfg(test)]
mod tests;

use super::{EngineSettings, registries::global_string};
use crate::{import::remotes::symphony_url, model::GlobalConfig};
use serde_json::{Value, json};
use std::time::Duration;

/// `GraphQL` query (`CloudMain.GET_CURRENT_USER`) for resolving the logged-in Bit Cloud user in [`cloud_username`].
const GET_CURRENT_USER: &str = "\n    query GET_ME {\n      me {\n        id\n        username\n        image\n        displayName\n      }\n    }\n  ";

/// How long ([`Duration`]) one [`cloud_username`] lookup may take before the install goes on as `anonymous`.
pub const LOOKUP_TIMEOUT: Duration = Duration::from_secs(5);

/// Resolve the username of the logged-in Bit Cloud user via `GraphQL` when `global` holds a token and the cloud answers within `timeout`.
pub async fn cloud_username(global: &GlobalConfig, timeout: Duration) -> Option<String> {
    let token = global_string(global, "user.token")?;
    if token.contains(['\r', '\n', '\0']) {
        return None;
    }
    let base_url = symphony_url(global);
    let base_url = base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        return None;
    }
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .ok()?;
    let response = client
        .post(format!("{base_url}/graphql"))
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({ "query": GET_CURRENT_USER }))
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    let body: Value = response.json().await.ok()?;
    body["data"]["me"]["username"]
        .as_str()
        .map(str::trim)
        .filter(|username| !username.is_empty())
        .map(str::to_string)
}

/// Name the cloud user in `settings.registry.network.user_agent` on [`EngineSettings`], unless the pnpm config sets one.
#[inline]
pub fn apply_cloud_username(settings: &mut EngineSettings, username: &str) {
    let username = username.trim();
    if settings.registry.cloud_user_agent && !username.is_empty() {
        settings.registry.network.user_agent = Some(format!("bit user/{username}"));
    }
}

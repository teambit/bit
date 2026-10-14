//! `PnpmPackageManager.getNetworkConfig`: without a configured `userAgent`,
//! the engine identifies as `bit user/<username>`, the username coming from
//! Bit Cloud (`CloudMain.getCurrentUser`) and `anonymous` when the cloud does
//! not answer. `fetchFromSymphonyViaGQL` uses a plain `fetch`, so no proxy or
//! TLS setting applies here either.

use super::{EngineSettings, registries::global_string};
use crate::{import::remotes::symphony_url, model::GlobalConfig};
use serde_json::{Value, json};
use std::time::Duration;

/// `CloudMain.GET_CURRENT_USER`.
const GET_CURRENT_USER: &str = "\n    query GET_ME {\n      me {\n        id\n        username\n        image\n        displayName\n      }\n    }\n  ";

/// How long one lookup may take before the install goes on as `anonymous`.
pub const LOOKUP_TIMEOUT: Duration = Duration::from_secs(5);

/// The username of the logged-in cloud user, when `global` holds a token and
/// the cloud answers within `timeout`.
pub async fn cloud_username(global: &GlobalConfig, timeout: Duration) -> Option<String> {
    let token = global_string(global, "user.token")?;
    let url = format!("{}/graphql", symphony_url(global));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .ok()?;
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {token}"))
        .json(&json!({ "query": GET_CURRENT_USER }))
        .send()
        .await
        .ok()?;
    let body: Value = response.json().await.ok()?;
    body["data"]["me"]["username"]
        .as_str()
        .filter(|username| !username.is_empty())
        .map(str::to_string)
}

/// Name the cloud user in the user agent, unless the pnpm config sets one.
pub fn apply_cloud_username(settings: &mut EngineSettings, username: &str) {
    if settings.registry.cloud_user_agent {
        settings.registry.network.user_agent = Some(format!("bit user/{username}"));
    }
}

#[cfg(test)]
mod tests;

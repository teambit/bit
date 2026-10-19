//! Retained installer Host requests and the scoped lane installation boundary.

use super::JsHost;
use crate::host::Host;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::{io, sync::Arc};

pub(super) fn lane_installation() -> bool {
    let arguments = std::env::args()
        .skip(1)
        .take(2)
        .collect::<Vec<_>>();
    arguments
        .first()
        .is_some_and(|command| command == "switch")
        || arguments
            .first()
            .is_some_and(|command| command == "lane")
            && arguments
                .get(1)
                .is_some_and(|command| matches!(command.as_str(), "import" | "checkout" | "revert"))
}

impl JsHost {
    pub(in crate::commands) fn new(host: Arc<Host>, quiet: bool) -> Self {
        Self(host, quiet)
    }

    pub(super) async fn call<Response: DeserializeOwned>(
        &self,
        method: &'static str,
        params: Value,
    ) -> io::Result<Response> {
        let host = Arc::clone(&self.0);
        let value = tokio::task::spawn_blocking(move || host.call(method, &params))
            .await
            .map_err(io::Error::other)??;
        serde_json::from_value(value).map_err(io::Error::other)
    }
}

pub(super) async fn links_changed(host: &JsHost, ids: &[String]) -> io::Result<()> {
    if lane_installation() {
        host.call::<Value>("switchInstallationLinked", json!({ "ids": ids })).await?;
    }
    Ok(())
}

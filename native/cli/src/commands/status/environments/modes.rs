//! Retained callback sessions change operation without replaying providers.
use super::{Environments, Host, io, json};

impl Environments {
    pub(in crate::commands::status) fn from_host(host: Host) -> Self {
        Self { host: Some(host), ..Self::new() }
    }

    pub(in crate::commands) fn continue_snapshot(self, build: bool) -> io::Result<Self> {
        if let Some(host) = &self.host {
            host.call("snapshotContinuation", &json!({}))?;
        }
        Ok(self.for_snapshot_build(build))
    }

    pub(in crate::commands) fn for_snapshot_build(mut self, build: bool) -> Self {
        self.snapshot = true;
        self.snapshot_build = build;
        self
    }

    pub(in crate::commands::status) fn is_snapshot(&self) -> bool {
        self.snapshot
    }

    pub(in crate::commands) fn for_checkout(mut self) -> Self {
        self.checkout = true;
        self
    }

    pub(in crate::commands::status) fn is_checkout(&self) -> bool {
        self.checkout
    }

    pub(in crate::commands) fn with_issue_facts(mut self, enabled: bool) -> Self {
        self.issue_facts = enabled;
        self
    }
}

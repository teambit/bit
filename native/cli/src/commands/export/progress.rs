//! Published export phase events are rendered before the corresponding remote effects.
use super::Exported;
use bit_install::output::Output;
use bit_object_import::export_progress::Event;
use std::env;

impl Exported {
    pub(super) fn progress_before(&self, output: &Output) {
        if self.selected_ids {
            output.status("exporting component");
            output.status(&format!("loading {} component(s)", self.count));
        } else {
            output.status("loading components");
            output.status(&self.exporting());
        }
    }

    pub(super) fn observe(&mut self, event: Event, output: &Output) {
        self.output.observed = true;
        match event {
            Event::Transfer { scope, objects } => output.status(&format!(
                r#"transferring {objects} objects to the remote "{scope}"..."#,
            )),
            Event::Verify => {
                output.restart("verifying that objects can be merged on the remotes...");
            }
            Event::Verified => self.fork_progress(output),
            Event::Persist { scope } => {
                output.restart(&format!(r#"persisting data on the remote "{scope}"..."#));
            }
            Event::HubMessage(message) => self.hub_message(&message, output),
        }
    }

    pub(super) fn progress(&mut self, output: &Output) {
        if !self.pending || self.output.failure_phase.as_deref() == Some("prepare") {
            return;
        }
        if !self.output.observed {
            if self.output.central_hub {
                for message in self.output.messages.clone() {
                    self.hub_message(&message, output);
                }
            } else {
                self.replay_direct(output);
            }
        }
        if self.result.is_ok() {
            output.status("updating data locally...");
        }
    }

    fn replay_direct(&self, output: &Output) {
        for (scope, objects) in &self.transfers {
            if self.output.attempted_scopes.contains(scope) {
                output.status(&format!(
                    r#"transferring {objects} objects to the remote "{scope}"..."#,
                ));
            }
        }
        if self.output.failure_phase.as_deref() == Some("push") {
            return;
        }
        output.restart("verifying that objects can be merged on the remotes...");
        if self.result.is_ok() {
            self.fork_progress(output);
        }
        for scope in &self.persisted {
            output.restart(&format!(r#"persisting data on the remote "{scope}"..."#));
        }
    }

    fn fork_progress(&self, output: &Output) {
        if let Some(history) = &self.fork_history
            && history.external_count > 0
        {
            let reason =
                format!("fetching version-history from forked-from lane {}", history.parent);
            output.restart(&format!("importing {} components {reason}", history.external_count));
            output.restart(&format!(
                "successfully imported {} components {reason}",
                history.external_count,
            ));
        }
    }

    fn hub_message(&mut self, message: &str, output: &Output) {
        let previous = self.output.last_hub_message.take().unwrap_or_else(|| self.hub_initial());
        let trimmed = message.trim();
        let resolved = if trimmed.is_empty() { previous } else { trimmed.to_owned() };
        output.restart(&resolved);
        self.output.last_hub_message = Some(resolved);
    }

    fn hub_initial(&self) -> String {
        if is_ci_enabled(env::var_os("CI").as_deref()) {
            r#"running command "export"..."#.to_owned()
        } else if self.selected_ids {
            format!("loading {} component(s)", self.count)
        } else {
            self.exporting()
        }
    }

    fn exporting(&self) -> String {
        let count =
            self.fork_history.as_ref().map_or(self.count, |history| history.candidate_count);
        if count > 1 { "exporting components".to_owned() } else { "exporting component".to_owned() }
    }
}

fn is_ci_enabled(value: Option<&std::ffi::OsStr>) -> bool {
    let Some(text) = value.and_then(std::ffi::OsStr::to_str) else {
        return false;
    };
    let trimmed = text.trim();
    !trimmed.is_empty()
        && !trimmed.eq_ignore_ascii_case("false")
        && !trimmed.eq_ignore_ascii_case("no")
        && !trimmed.eq_ignore_ascii_case("off")
        && trimmed != "0"
}

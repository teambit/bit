//! Retain one published switch loader while Rust captures each requested source.

use super::{Environments, Host, Value, callbacks, decline, io, json};
use crate::commands::status::capture::{Capture, callback_load_stdout, callback_startup_stdout};

impl Environments {
    pub(in crate::commands::status) fn switch_begin(
        &self,
        context: &Value,
        capture: &Capture,
        order: &[String],
    ) -> io::Result<Option<callbacks::SwitchStage>> {
        if !self.checkout || self.host.is_none() {
            return Ok(None);
        }
        let host = self.host.as_ref().ok_or_else(|| decline("switch callback host"))?;
        callbacks::switch_begin(host, context, capture, order)
            .map_err(|error| self.callback_failure(capture, error))
    }

    pub(in crate::commands::status) fn switch_one(
        &self,
        context: &Value,
        capture: &Capture,
        identity: &str,
    ) -> io::Result<Value> {
        let identity = identity.trim();
        if identity.is_empty() {
            return Err(decline("switch callback identity"));
        }
        let host = self.host.as_ref().ok_or_else(|| decline("switch callback host"))?;
        callbacks::switch_one(host, context, capture, identity)
            .map_err(|error| self.callback_failure(capture, error))
    }

    pub(in crate::commands::status) fn switch_stage_row(
        &self,
        context: &Value,
        capture: &Capture,
        identity: &str,
    ) -> io::Result<()> {
        let identity = identity.trim();
        if identity.is_empty() {
            return Err(decline("switch callback identity"));
        }
        let host = self.host.as_ref().ok_or_else(|| decline("switch callback host"))?;
        callbacks::switch_stage_row(host, context, capture, identity)
            .map_err(|error| self.callback_failure(capture, error))
    }

    pub(in crate::commands::status) fn switch_resume(
        &self,
        capture: &Capture,
    ) -> io::Result<Value> {
        let host = self.host.as_ref().ok_or_else(|| decline("switch callback host"))?;
        callbacks::switch_resume(host, capture)
            .map_err(|error| self.callback_failure(capture, error))
    }

    pub(in crate::commands::status) fn switch_accept(
        &self,
        capture: &mut Capture,
        result: &Value,
        identity: &str,
    ) -> io::Result<()> {
        let identity = identity.trim();
        if identity.is_empty() {
            return Err(decline("switch callback identity"));
        }
        callbacks::switch_accept(capture, result, identity)
            .map_err(|error| self.callback_failure(capture, error))
    }

    pub(in crate::commands::status) fn switch_finish(
        &mut self,
        capture: &mut Capture,
        stage: callbacks::SwitchStage,
    ) -> io::Result<()> {
        let host = self.host.as_ref().ok_or_else(|| decline("switch callback host"))?;
        callbacks::switch_finish(host, capture, stage)
            .map_err(|error| self.callback_failure(capture, error))?;
        capture.cache.retain_callback_host(self.host.take());
        Ok(())
    }

    pub(in crate::commands::status) fn switch_abort(
        &self,
        capture: &Capture,
        error: io::Error,
    ) -> io::Error {
        let host_failed = error
            .get_ref()
            .is_some_and(
                <dyn std::error::Error + Send + Sync>::is::<
                    crate::host::callback_error::CallbackError,
                >,
            );
        if !host_failed && let Some(host) = &self.host {
            let _ = host.call("switchStatusFinish", &json!({}));
            capture.cache.retain_callback_stdout(&host.take_stdout());
        }
        if host_failed { error } else { self.callback_failure(capture, error) }
    }

    fn callback_failure(&self, capture: &Capture, error: io::Error) -> io::Error {
        let output = self.host.as_ref().map_or_else(String::new, Host::take_stdout);
        crate::host::callback_error::CallbackError::wrap(
            error,
            callback_startup_stdout(capture),
            format!("{}{}", callback_load_stdout(capture), output),
        )
    }
}

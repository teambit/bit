//! Retain published [`ProjectedLinker`] providers while native identity operations materialize and link files.
//!
//! Coordinates [`cached`], [`controls`], [`fork`], [`inbound`], [`installation`], [`load`], [`removal`], and [`selectors`].
mod cached;
mod controls;
mod fork;
mod inbound;
mod installation;
mod load;
mod removal;
mod retained;
mod selection;
mod selectors;

use super::{cache, execution, linking};
use crate::{
    commands::{color::Chalk, status::environments::Environments},
    host::{Host, callback_error::CallbackError},
};
use serde_json::{Value, json};
use std::{io, path::Path, sync::Arc};

/// Retained [`Environments`] provider and [`retained::Retained`] source-spool session shared across native workspace identity mutations.
pub(in crate::commands) struct ProjectedLinker {
    environment: Option<Environments>,
    stdout: String,
    retained: retained::Retained,
    installation: Option<bit_install::HostInfo>,
}

impl ProjectedLinker {
    /// Load extensions while their original workspace paths still exist.
    pub(in crate::commands) fn prepare(root: &Path) -> io::Result<Self> {
        if !root.is_absolute() || !has_root_text(root) {
            return Err(io::Error::other("identity workspace root is empty"));
        }
        let mut linker = Self {
            environment: Some(Environments::for_tracking().for_checkout()),
            stdout: String::new(),
            retained: retained::Retained::default(),
            installation: None,
        };
        linker.call(root, "identityBootstrap", &json!({}))?;
        Ok(linker)
    }

    /// Takes and clears any accumulated provider stdout captured during identity operations.
    #[inline]
    pub(in crate::commands) fn take_stdout(&mut self) -> String {
        std::mem::take(&mut self.stdout)
    }

    /// Match a consumer reload while retaining callback spool ownership on [`retained::Retained`].
    #[inline]
    pub(in crate::commands) fn forget_loaded(&mut self) {
        self.retained.forget_loaded();
    }

    /// Read native source and dependency metadata on the same hydrated provider session.
    pub(in crate::commands) fn capture(
        &mut self,
        root: &Path,
        bitmap: &Value,
        identities: &[String],
    ) -> io::Result<Vec<Value>> {
        if !has_root_text(root) {
            return self.finish(Err(io::Error::other("identity workspace root is empty")));
        }
        let result =
            load::capture(root, bitmap, identities, &mut self.environment, &mut self.stdout);
        let result = result.and_then(|capture| self.retained.keep(capture));
        self.finish(result)
    }

    /// Transfer immutable native capture proofs to a retained parent-operation plan.
    #[inline]
    pub(in crate::commands) fn captured_read_set(&self) -> Vec<Value> {
        self.retained.read_receipts()
    }

    /// Revalidate retained native facts before a consumer publishes workspace mutations.
    #[inline]
    pub(in crate::commands) fn validate_captures(&self) -> io::Result<()> {
        self.retained.validate()
    }

    /// Links the materialized projection for `identities` before the caller publishes its retained `bitmap`.
    #[inline]
    pub(in crate::commands) fn link(
        &mut self,
        root: &Path,
        bitmap: &Value,
        identities: &[String],
        json: bool,
        chalk: Chalk,
    ) -> io::Result<()> {
        let result = self.link_inner(root, bitmap, identities, json, chalk);
        self.finish(result)
    }

    /// Invoke only registered extension, AST or compiler behavior through the retained host.
    pub(in crate::commands) fn call(
        &mut self,
        root: &Path,
        method: &str,
        params: &Value,
    ) -> io::Result<Value> {
        let method = method.trim();
        if !has_root_text(root) || method.is_empty() {
            return Err(io::Error::other("identity provider method is empty"));
        }
        let result = self.environment
            .as_mut()
            .ok_or_else(|| io::Error::other("identity provider session unavailable"))?
            .identity_call(root, method, params)
            .map(|(value, stdout)| {
                self.stdout.push_str(&stdout);
                value
            });
        self.finish(result)
    }

    /// Flushes accumulated provider and [`CallbackError`] stdout when `result` is an `Err`.
    fn finish<ResultValue>(&mut self, result: io::Result<ResultValue>) -> io::Result<ResultValue> {
        if let Err(error) = &result {
            print!("{}", self.take_stdout());
            if let Some(callback) =
                error.get_ref().and_then(|error| error.downcast_ref::<CallbackError>())
            {
                print!("{}{}", callback.startup, callback.output);
            }
        }
        result
    }

    fn link_inner(
        &mut self,
        root: &Path,
        bitmap: &Value,
        identities: &[String],
        json: bool,
        chalk: Chalk,
    ) -> io::Result<()> {
        let mut loaded =
            load::prepare(root, bitmap, identities, &mut self.environment, &mut self.stdout)?;
        load::enrich(&mut loaded)?;
        let host = load::host(&mut loaded.capture)?;
        let mut components = selection::components(&loaded.projection, identities);
        selection::seed_environments(&mut components, &host, &loaded.capture.captured)?;
        linking::overlay(&mut components, &loaded.capture.captured)?;
        load::commit(root, &mut loaded)?;
        let manifests = cache::Manifests::observe(root, &components);
        let linked = execution::link(
            root,
            &loaded.projection,
            &loaded.capture,
            &components,
            &host,
            json,
            chalk,
        );
        let linked =
            linked.and_then(|()| load::invalidate_changed(root, &components, &manifests, &host));
        self.restore(host)?;
        linked
    }

    fn restore(&mut self, host: Arc<Host>) -> io::Result<()> {
        self.stdout.push_str(&host.take_stdout());
        let host = Arc::try_unwrap(host)
            .map_err(|_| io::Error::other("identity provider session still borrowed"))?;
        self.environment = Some(Environments::from_host(host).for_checkout());
        Ok(())
    }
}

#[inline]
fn has_root_text(root: &Path) -> bool {
    root.to_str()
        .map_or(!root.as_os_str().is_empty(), |text| !text.trim().is_empty())
}

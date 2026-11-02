//! Cooperative cancellation closes transport futures without rolling back acknowledged writes.
//!
//! [`Cancellation`] races in-flight [`Future`] operations against a [`Notify`] cancellation signal using [`select`].
#[cfg(test)]
mod tests;

use futures_util::future::{Either, select};
use std::{
    cell::RefCell,
    future::Future,
    io,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
use tokio::sync::Notify;

/// Cloneable cooperative cancellation token backed by [`State`] (`AtomicBool` and [`Notify`]).
#[derive(Debug, Default, Clone)]
pub struct Cancellation(Arc<State>);
/// Shared atomic cancellation flag and [`Notify`] wakeup state for [`Cancellation`].
#[derive(Debug, Default)]
struct State {
    cancelled: AtomicBool,
    changed: Notify,
}
thread_local! {
    static CURRENT: RefCell<Option<Cancellation>> = const { RefCell::new(None) };
}
/// RAII guard restoring the previous thread-local [`Cancellation`] owner on drop.
#[derive(Debug)]
struct Restore(Option<Cancellation>);
impl Drop for Restore {
    #[inline]
    fn drop(&mut self) {
        CURRENT.with(|current| current.replace(self.0.take()));
    }
}
impl Cancellation {
    /// Capture the construction thread's owner; no owner means an independent operation.
    #[inline]
    #[must_use]
    pub fn current() -> Self {
        CURRENT
            .with(|current| current.borrow().clone())
            .unwrap_or_default()
    }
    /// Scope synchronous construction on this thread, restoring nested owners even on panic.
    #[inline]
    pub fn scope<ResultValue>(
        cancellation: &Self,
        function: impl FnOnce() -> ResultValue,
    ) -> ResultValue {
        let previous = CURRENT.with(|current| current.replace(Some(cancellation.clone())));
        let _restore = Restore(previous);
        function()
    }
    /// Creates a new uncancelled [`Cancellation`] token.
    #[inline]
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    /// Signals cancellation and wakes all tasks awaiting [`Self::cancelled`].
    #[inline]
    pub fn cancel(&self) {
        if !self.0.cancelled.swap(true, Ordering::AcqRel) {
            self.0.changed.notify_waiters();
        }
    }
    /// Returns `true` when [`Self::cancel`] has been invoked on this token.
    #[inline]
    #[must_use]
    pub fn is_cancelled(&self) -> bool {
        self.0.cancelled.load(Ordering::Acquire)
    }
    /// Wait until the operation owner requests cancellation.
    pub async fn cancelled(&self) {
        let changed = self.0.changed.notified();
        futures_util::pin_mut!(changed);
        changed.as_mut().enable();
        if !self.is_cancelled() {
            changed.await;
        }
    }
    /// Races `future` against [`Self::cancelled`], returning an `Interrupted` [`io::Error`] if cancelled.
    pub(crate) async fn run<ResultValue>(
        &self,
        future: impl Future<Output = ResultValue>,
    ) -> io::Result<ResultValue> {
        if self.is_cancelled() {
            return Err(cancelled_error());
        }
        let cancelled = self.cancelled();
        futures_util::pin_mut!(cancelled, future);
        match select(cancelled, future).await {
            Either::Left(_) => Err(cancelled_error()),
            Either::Right((result, _)) => {
                if self.is_cancelled() {
                    Err(cancelled_error())
                } else {
                    Ok(result)
                }
            }
        }
    }
}

#[inline]
fn cancelled_error() -> io::Error {
    io::Error::new(io::ErrorKind::Interrupted, "operation cancelled")
}

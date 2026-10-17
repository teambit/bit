//! Cooperative cancellation closes transport futures without rolling back acknowledged writes.
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

#[derive(Default, Clone)]
pub struct Cancellation(Arc<State>);
#[derive(Default)]
struct State {
    cancelled: AtomicBool,
    changed: Notify,
}
thread_local! {
    static CURRENT: RefCell<Option<Cancellation>> = const { RefCell::new(None) };
}
struct Restore(Option<Cancellation>);
impl Drop for Restore {
    fn drop(&mut self) {
        CURRENT.with(|current| current.replace(self.0.take()));
    }
}
impl Cancellation {
    /// Capture the construction thread's owner; no owner means an independent operation.
    #[must_use]
    pub fn current() -> Self {
        CURRENT
            .with(|current| current.borrow().clone())
            .unwrap_or_default()
    }
    /// Scope synchronous construction on this thread, restoring nested owners even on panic.
    pub fn scope<ResultValue>(
        cancellation: &Self,
        function: impl FnOnce() -> ResultValue,
    ) -> ResultValue {
        let previous = CURRENT.with(|current| current.replace(Some(cancellation.clone())));
        let _restore = Restore(previous);
        function()
    }
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
    pub fn cancel(&self) {
        self.0.cancelled.store(true, Ordering::Release);
        self.0.changed.notify_waiters();
    }
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
    pub(crate) async fn run<ResultValue>(
        &self,
        future: impl Future<Output = ResultValue>,
    ) -> io::Result<ResultValue> {
        let cancelled = self.cancelled();
        futures_util::pin_mut!(cancelled, future);
        match select(cancelled, future).await {
            Either::Left(_) => {
                Err(io::Error::new(io::ErrorKind::Interrupted, "operation cancelled"))
            }
            Either::Right((result, _)) => Ok(result),
        }
    }
}

#[cfg(test)]
mod tests;

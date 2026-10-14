pub use inspection::WorkspaceInspectionSnapshot;
pub use install::install;
pub use stream::ImportStreamEngine;

mod inspection;
mod install;
mod stream;
mod stream_io;

use bit_object_import::{WorkspaceDispatcher, WorkspaceSession};
use napi::{
    Env, Error, JsString, Result, Task,
    bindgen_prelude::{Buffer, Object},
};
use napi_derive::napi;
use std::{
    panic::{AssertUnwindSafe, catch_unwind},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

struct State {
    dispatcher: WorkspaceDispatcher,
    session: Mutex<Option<WorkspaceSession>>,
    closed: AtomicBool,
    busy: AtomicBool,
}

#[napi]
pub struct WorkspaceEngine {
    state: Arc<State>,
}

#[napi]
impl WorkspaceEngine {
    #[napi(constructor)]
    pub fn new(threads: u32) -> Result<Self> {
        // Initialize Rayon after dlopen has released the dynamic linker lock.
        let session = WorkspaceSession::new(threads as usize).map_err(failure)?;
        Ok(Self::from_session(session))
    }

    #[napi(factory)]
    pub fn for_objects(
        threads: u32,
        directory: String,
        uid: Option<u32>,
        gid: Option<u32>,
    ) -> Result<Self> {
        let owner = match (uid, gid) {
            (Some(uid), Some(gid)) => Some((uid, gid)),
            (None, None) => None,
            _ => return Err(failure("object owner requires both uid and gid")),
        };
        let session = WorkspaceSession::with_store(threads as usize, directory.into(), owner)
            .map_err(failure)?;
        Ok(Self::from_session(session))
    }

    #[napi]
    pub fn request<'env>(&self, env: &'env Env, frame: Buffer) -> Result<Object<'env>> {
        if frame.len() > 128 * 1024 * 1024 || self.state.closed.load(Ordering::Acquire) {
            return Err(failure("workspace engine closed or frame too large"));
        }
        if self.state.busy.swap(true, Ordering::AcqRel) {
            return Err(failure("workspace engine already has an active request"));
        }
        let bytes = frame.to_vec();
        drop(frame);
        let mut task = WorkspaceRequest { state: Arc::clone(&self.state), frame: bytes };
        let (deferred, promise) = env.create_deferred::<Buffer, _>()?;
        self.state.dispatcher.spawn(move || {
            let result = task.compute();
            deferred.resolve(move |env| {
                let result = result.and_then(|output| task.resolve(env, output));
                task.finally(env)?;
                result
            });
        });
        Ok(promise)
    }

    /// Retire without blocking the event loop. The caller must await its active request.
    #[napi]
    pub fn close(&self) {
        self.state.closed.store(true, Ordering::Release);
        if let Ok(mut session) = self.state.session.try_lock() {
            session.take();
        }
    }
}

impl WorkspaceEngine {
    fn from_session(session: WorkspaceSession) -> Self {
        Self {
            state: Arc::new(State {
                dispatcher: session.dispatcher(),
                session: Mutex::new(Some(session)),
                closed: AtomicBool::new(false),
                busy: AtomicBool::new(false),
            }),
        }
    }
}

pub struct WorkspaceRequest {
    state: Arc<State>,
    frame: Vec<u8>,
}

impl Task for WorkspaceRequest {
    type Output = Vec<u8>;
    type JsValue = Buffer;

    fn compute(&mut self) -> Result<Self::Output> {
        if self.state.closed.load(Ordering::Acquire) {
            return Err(failure("workspace engine closed"));
        }
        let result = catch_unwind(AssertUnwindSafe(|| {
            let mut session = self.state.session.lock().map_err(failure)?;
            let result = session
                .as_mut()
                .ok_or_else(|| failure("workspace engine closed"))?
                .request(&self.frame)
                .map_err(failure);
            if result.is_err() || self.state.closed.load(Ordering::Acquire) {
                session.take();
            }
            result
        }))
        .unwrap_or_else(|_| Err(failure("workspace engine panicked")));
        if result.is_err() {
            self.state.closed.store(true, Ordering::Release);
        }
        result
    }

    fn resolve(&mut self, _: Env, output: Vec<u8>) -> Result<Buffer> {
        if self.state.closed.load(Ordering::Acquire) {
            return Err(failure("workspace engine closed"));
        }
        Ok(output.into())
    }

    fn finally(self, _: Env) -> Result<()> {
        if self.state.closed.load(Ordering::Acquire) {
            self.state.session
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .take();
        }
        Ok(())
    }
}

impl Drop for WorkspaceRequest {
    fn drop(&mut self) {
        self.state.busy.store(false, Ordering::Release);
    }
}

fn failure(error: impl std::fmt::Display) -> Error {
    Error::from_reason(error.to_string())
}

/// Pure synchronous planning avoids an event-loop hop between policy checkpoints.
#[napi]
pub fn plan_dependency_policy(input: JsString<'_>, finish: bool) -> Result<String> {
    if input.utf8_len()? > 4 * 1024 * 1024 {
        return Err(failure("dependency policy input limit"));
    }
    let input = input.into_utf8()?;
    let input = input.as_str()?;
    catch_unwind(|| bit_object_import::plan_dependency_policy(input, finish))
        .map_err(|_| failure("dependency policy panicked"))?
        .map_err(failure)
}

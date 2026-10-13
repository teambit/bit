use super::{WorkspaceEngine, failure};
use napi::{Result, bindgen_prelude::Buffer};
use napi_derive::napi;
use std::sync::atomic::Ordering;

#[napi]
pub struct WorkspaceInspectionSnapshot {
    snapshot: Option<bit_object_import::InspectionSnapshot>,
}
#[napi]
impl WorkspaceInspectionSnapshot {
    #[napi]
    pub fn read(&self, index: u32) -> Result<Buffer> {
        self.snapshot
            .as_ref()
            .ok_or_else(|| failure("inspection snapshot closed"))?
            .read(index as usize)
            .map(Buffer::from)
            .map_err(failure)
    }
    #[napi]
    pub fn close(&mut self) {
        self.snapshot.take();
    }
}
#[napi]
#[expect(clippy::needless_pass_by_value, reason = "Node-API requires owned JavaScript strings")]
impl WorkspaceEngine {
    #[napi]
    pub fn inspection_snapshot(&self, token: String) -> Result<WorkspaceInspectionSnapshot> {
        if self.state.closed.load(Ordering::Acquire) || self.state.busy.load(Ordering::Acquire) {
            return Err(failure("workspace engine closed or busy"));
        }
        let session = self.state.session.lock().map_err(failure)?;
        let snapshot = session
            .as_ref()
            .ok_or_else(|| failure("workspace engine closed"))?
            .inspection_snapshot(&token)
            .map_err(failure)?;
        Ok(WorkspaceInspectionSnapshot { snapshot: Some(snapshot) })
    }
}

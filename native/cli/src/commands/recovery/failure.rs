//! A lane abort reports checkout failure after its control restoration has committed.
use super::{Engine, array, decline};
use crate::commands::status::autosync::Startup;
use serde_json::Value;
use std::{fmt, io};

pub(super) fn preflight(request: &Value) -> io::Result<()> {
    let mut engine = Engine::new()?;
    let result = engine.request::<Value>(request);
    match result {
        Ok(prepared) => {
            if array(prepared.get("captureTargets"), "recovery capture targets")?.len()
                != array(prepared.get("targets"), "recovery targets")?.len()
            {
                return Err(decline("recovery missing component root"));
            }
            Ok(())
        }
        Err(error) if !crate::commands::engine::is_canonical(&error) => Err(error),
        _ => Ok(()),
    }
}
#[derive(Debug)]
struct Restored(Value);
impl fmt::Display for Restored {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("restored lane checkout failure")
    }
}
impl std::error::Error for Restored {}
pub(super) fn restored(result: Value) -> io::Error {
    io::Error::other(Restored(result))
}
pub(super) fn result(error: &io::Error) -> Option<&Value> {
    error
        .get_ref()?
        .downcast_ref::<Restored>()
        .map(|error| &error.0)
}
pub(super) fn retain(startup: &mut Startup, error: &io::Error) {
    if let Some(error) = error
        .get_ref()
        .and_then(|error| error.downcast_ref::<crate::host::callback_error::CallbackError>())
    {
        startup.stdout.push_str(&error.startup);
        startup.build_stdout.push_str(&error.output);
    }
}

use crate::{Request, Response, limits, scan, transport};
use rayon::prelude::*;
use serde_json::Value;
pub(crate) fn process_request(
    input: &str,
    pool: &rayon::ThreadPool,
) -> Result<Value, serde_json::Error> {
    match serde_json::from_str::<Request>(input) {
        Ok(req) if req.files.len() > limits::BATCH_FILES => {
            Ok(transport::invalid_request("batch exceeds 4096 files limit"))
        }
        Ok(req) if req.version == 1 => serde_json::to_value(Response {
            version: 1,
            id: req.id,
            files: pool.install(|| {
                req.files
                    .par_iter()
                    .map(|file| scan(file, !req.options.is_empty()))
                    .collect()
            }),
        }),
        Ok(_) => Ok(
            serde_json::json!({"version":1,"status":"invalid_request","diagnostics":["unsupported protocol version"]}),
        ),
        Err(error) => Ok(
            serde_json::json!({"version":1,"status":"invalid_request","diagnostics":[error.to_string()]}),
        ),
    }
}

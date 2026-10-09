use crate::{
    Request, Response, limits, scan_with_metrics,
    timings::{Metrics, Stage, measure},
    transport,
};
use rayon::prelude::*;
use serde_json::Value;
pub(crate) fn process_request(
    input: &str,
    pool: &rayon::ThreadPool,
) -> Result<Value, serde_json::Error> {
    process_with_metrics(input, pool, None)
}
pub(crate) fn process_with_metrics(
    input: &str,
    pool: &rayon::ThreadPool,
    metrics: Option<&Metrics>,
) -> Result<Value, serde_json::Error> {
    match measure(metrics, Stage::Decode, || serde_json::from_str::<Request>(input)) {
        Ok(req) if req.files.len() > limits::BATCH_FILES => {
            Ok(transport::invalid_request("batch exceeds 4096 files limit"))
        }
        Ok(req) if req.version == 1 => process_batch(req, pool, metrics),
        Ok(_) => Ok(
            serde_json::json!({"version":1,"status":"invalid_request","diagnostics":["unsupported protocol version"]}),
        ),
        Err(error) => Ok(
            serde_json::json!({"version":1,"status":"invalid_request","diagnostics":[error.to_string()]}),
        ),
    }
}

fn process_batch(
    req: Request,
    pool: &rayon::ThreadPool,
    metrics: Option<&Metrics>,
) -> Result<Value, serde_json::Error> {
    if let Some(metrics) = metrics {
        metrics.sources(
            req.files.len(),
            req.files
                .iter()
                .filter(|file| file.source.is_some())
                .count(),
        );
    }
    let response = Response {
        version: 1,
        id: req.id,
        files: pool.install(|| {
            req.files
                .par_iter()
                .map(|file| scan_with_metrics(file, !req.options.is_empty(), metrics))
                .collect()
        }),
    };
    measure(metrics, Stage::Serialize, || serde_json::to_value(response))
}

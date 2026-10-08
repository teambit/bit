use serde::Serialize;
use serde_json::Value;
use std::{
    io::{self, Write},
    sync::atomic::{AtomicU64, AtomicUsize, Ordering},
    time::{Duration, Instant},
};

#[derive(Clone, Copy)]
pub(crate) enum Stage {
    SourceRead,
    Parse,
    Extract,
    Decode,
    Serialize,
}
#[derive(Default)]
struct Counters {
    source_read: AtomicU64,
    parse: AtomicU64,
    extract: AtomicU64,
    decode: AtomicU64,
    serialize: AtomicU64,
}
#[derive(Default)]
pub(crate) struct Metrics {
    counters: Counters,
    requested_files: AtomicUsize,
    inline_sources: AtomicUsize,
}
impl Metrics {
    fn counter(&self, stage: Stage) -> &AtomicU64 {
        match stage {
            Stage::SourceRead => &self.counters.source_read,
            Stage::Parse => &self.counters.parse,
            Stage::Extract => &self.counters.extract,
            Stage::Decode => &self.counters.decode,
            Stage::Serialize => &self.counters.serialize,
        }
    }
    fn record(&self, stage: Stage, elapsed: Duration) {
        let nanoseconds = duration_ns(elapsed);
        self.counter(stage).fetch_add(nanoseconds, Ordering::Relaxed);
    }
    pub(crate) fn sources(&self, requested: usize, inline: usize) {
        self.requested_files.store(requested, Ordering::Relaxed);
        self.inline_sources.store(inline, Ordering::Relaxed);
    }
    fn durations(&self, batch_wall: Duration) -> Durations {
        Durations {
            source_read: self.counter(Stage::SourceRead).load(Ordering::Relaxed),
            oxc_parse: self.counter(Stage::Parse).load(Ordering::Relaxed),
            extraction: self.counter(Stage::Extract).load(Ordering::Relaxed),
            request_decode: self.counter(Stage::Decode).load(Ordering::Relaxed),
            response_serialize_write: self.counter(Stage::Serialize).load(Ordering::Relaxed),
            batch_wall: duration_ns(batch_wall),
        }
    }
}
fn duration_ns(duration: Duration) -> u64 {
    u64::try_from(duration.as_nanos()).unwrap_or(u64::MAX)
}
pub(crate) fn measure<Output>(
    metrics: Option<&Metrics>,
    stage: Stage,
    operation: impl FnOnce() -> Output,
) -> Output {
    let Some(metrics) = metrics else {
        return operation();
    };
    let started = Instant::now();
    let result = operation();
    metrics.record(stage, started.elapsed());
    result
}

pub(crate) struct Profile {
    metrics: Metrics,
    started: Instant,
}
#[derive(Serialize)]
struct Durations {
    #[serde(rename = "source_read_ns")]
    source_read: u64,
    #[serde(rename = "oxc_parse_ns")]
    oxc_parse: u64,
    #[serde(rename = "extraction_ns")]
    extraction: u64,
    #[serde(rename = "request_decode_ns")]
    request_decode: u64,
    #[serde(rename = "response_serialize_write_ns")]
    response_serialize_write: u64,
    #[serde(rename = "batch_wall_ns")]
    batch_wall: u64,
}
#[derive(Serialize)]
struct Files {
    requested: usize,
    inline_sources: usize,
}
#[derive(Serialize)]
struct Diagnostic<'status> {
    schema_version: u32,
    event: &'static str,
    request_index: u64,
    status: &'status str,
    files: Files,
    durations: Durations,
}
impl Profile {
    pub(crate) fn new() -> Self {
        Self { metrics: Metrics::default(), started: Instant::now() }
    }
    pub(crate) fn metrics(&self) -> &Metrics {
        &self.metrics
    }
    pub(crate) fn emit(
        &self,
        writer: &mut impl Write,
        response: &Value,
        request_index: u64,
    ) -> io::Result<()> {
        let diagnostic = Diagnostic {
            schema_version: 1,
            event: "dependency_scanner_timings",
            request_index,
            status: response
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("batch"),
            files: Files {
                requested: self.metrics.requested_files.load(Ordering::Relaxed),
                inline_sources: self.metrics.inline_sources.load(Ordering::Relaxed),
            },
            durations: self.metrics.durations(self.started.elapsed()),
        };
        serde_json::to_writer(&mut *writer, &diagnostic)?;
        writeln!(writer)?;
        writer.flush()
    }
}

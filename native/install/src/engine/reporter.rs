//! pnpm's terminal output, rendered natively, plus the install stats the
//! engine reports through its event stream.
//!
//! `pnpm_reporter::Reporter` is a static trait (`emit` has no `&self`), so the
//! renderer and the stats accumulator live in process-global slots installed
//! for the duration of one engine call. Engine calls are serialized
//! (`run::engine_call_lock`), so one slot is enough.

mod options;
use crate::host::HostInfo;
use pnpm_default_reporter::{
    MaxLogLevel,
    colors::Colors,
    diff::Diff,
    state::{Output, ReporterOptions as StateOptions, ReporterState},
};
use pnpm_reporter::{FetchingProgressMessage, LogEvent, Reporter, StatsMessage};
use std::{
    fmt,
    io::Write,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

/// `ignoredBuildsInstructionText`, verbatim from `lynx.ts`.
const APPROVE_BUILDS_INSTRUCTION_TEXT: &str = "Update the \"allowScripts\" field under \"teambit.dependencies/dependency-resolver\" in workspace.jsonc. \nSet to true to allow, false to explicitly disallow. \nExample: allowScripts: { \"esbuild\": true, \"core-js\": false }. \nThis is a security-sensitive setting: enabling scripts may allow arbitrary code execution during install.";

/// Receives rendered chunks instead of stdout (Bit's CLI server forwards them
/// to connected editors).
#[derive(Clone)]
pub struct OutputSink(pub Arc<dyn Fn(&str) + Send + Sync>);

impl fmt::Debug for OutputSink {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("OutputSink")
    }
}

/// Bit's reporter options (`toReporterOptions` in `lynx.ts`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReporterSettings {
    /// `optimizeReportForNonTerminal`.
    pub append_only: bool,
    pub throttle_progress: Duration,
    /// Set for lockfile-only installs.
    pub hide_added_pkgs_progress: bool,
    /// pnpm's `outputMaxWidth`: the terminal width minus two, or 80.
    pub width: usize,
    pub color: bool,
}

impl ReporterSettings {
    #[must_use]
    pub fn new(info: &HostInfo) -> Self {
        ReporterSettings {
            append_only: false,
            throttle_progress: Duration::from_millis(200),
            hide_added_pkgs_progress: false,
            width: info.columns.map_or(80, |columns| (columns as usize).saturating_sub(2).max(1)),
            color: info.color,
        }
    }
    pub(crate) fn apply_throttle_progress(
        &mut self,
        value: Option<&serde_json::Value>,
    ) -> std::io::Result<()> {
        if let Some(duration) = options::throttle(value)? {
            self.throttle_progress = duration;
        }
        Ok(())
    }
}

/// Install outcome accumulated from the event stream.
#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct InstallStats {
    pub added: u64,
    pub removed: u64,
}

/// One call's renderer: the folded reporter state, the frame differ and the
/// progress throttle (`NativeRenderer` in `@pnpm/napi`).
pub(super) struct Renderer {
    state: ReporterState,
    diff: Diff,
    frame_buf: String,
    throttle: Duration,
    last_write: Option<Instant>,
    output: Option<OutputSink>,
}

impl Renderer {
    pub(super) fn new(
        settings: &ReporterSettings,
        cwd: String,
        output: Option<OutputSink>,
    ) -> Self {
        let options = StateOptions {
            append_only: settings.append_only,
            ignored_builds_instruction_text: Some(APPROVE_BUILDS_INSTRUCTION_TEXT.to_string()),
            hide_linked_pkgs_diff: vec!["@teambit/*".to_string()],
            max_log_level: MaxLogLevel::Info,
            progress: pnpm_default_reporter::state::ProgressOptions {
                hide_added_pkgs: settings.hide_added_pkgs_progress,
                hide_prefix: false,
            },
            ..StateOptions::default()
        };
        Renderer {
            state: ReporterState::new_with_options(
                cwd,
                settings.width,
                Colors { enabled: settings.color },
                options,
            ),
            diff: Diff::new(settings.width.saturating_add(2)),
            frame_buf: String::new(),
            throttle: settings.throttle_progress,
            last_write: None,
            output,
        }
    }

    fn handle(&mut self, event: &LogEvent) {
        let output = self.state.handle(event);
        // A dropped progress redraw is folded already; the next event that is
        // not coalesceable renders the current counts.
        if is_coalesceable(event)
            && self.last_write.is_some_and(|last| last.elapsed() < self.throttle)
        {
            return;
        }
        if self.write(output) {
            self.last_write = Some(Instant::now());
        }
    }

    fn write(&mut self, output: Output) -> bool {
        match output {
            Output::None => return false,
            Output::Lines(lines) => {
                let chunk = lines
                    .iter()
                    .fold(String::new(), |mut chunk, line| {
                        chunk.push_str(line);
                        chunk.push('\n');
                        chunk
                    });
                self.emit(&chunk);
            }
            Output::Frame(mut frame) => {
                if !frame.ends_with('\n') {
                    frame.push('\n');
                }
                // `\r` resets the column; `\x1b[K\x1b[0J` erases what the
                // previous frame left below this one.
                self.frame_buf.clear();
                self.frame_buf.push('\r');
                self.diff.update_into(&frame, &mut self.frame_buf);
                self.frame_buf.push_str("\x1b[K\x1b[0J");
                let chunk = std::mem::take(&mut self.frame_buf);
                self.emit(&chunk);
                self.frame_buf = chunk;
            }
        }
        true
    }

    fn emit(&self, chunk: &str) {
        if let Some(sink) = &self.output {
            (sink.0)(chunk);
        } else {
            let mut stdout = std::io::stdout().lock();
            let _ = stdout.write_all(chunk.as_bytes());
            let _ = stdout.flush();
        }
    }
}

/// A high-volume progress update that may be dropped under throttling.
fn is_coalesceable(event: &LogEvent) -> bool {
    match event {
        LogEvent::Progress(_) => true,
        LogEvent::FetchingProgress(log) => {
            matches!(log.message, FetchingProgressMessage::InProgress { .. })
        }
        _ => false,
    }
}

fn renderer_slot() -> &'static Mutex<Option<Renderer>> {
    static SLOT: OnceLock<Mutex<Option<Renderer>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

fn stats_slot() -> &'static Mutex<Option<InstallStats>> {
    static SLOT: OnceLock<Mutex<Option<InstallStats>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

/// Installs the renderer and a fresh stats accumulator for one engine call,
/// and clears both on drop, including on unwind.
pub(super) struct ReporterGuard;

impl ReporterGuard {
    pub(super) fn install(renderer: Option<Renderer>) -> Self {
        if let Ok(mut slot) = renderer_slot().lock() {
            *slot = renderer;
        }
        if let Ok(mut slot) = stats_slot().lock() {
            *slot = Some(InstallStats::default());
        }
        ReporterGuard
    }

    /// The stats accumulated so far.
    pub(super) fn take_stats() -> InstallStats {
        stats_slot()
            .lock()
            .ok()
            .and_then(|mut slot| slot.take())
            .unwrap_or_default()
    }
}

impl Drop for ReporterGuard {
    fn drop(&mut self) {
        if let Ok(mut slot) = renderer_slot().lock() {
            *slot = None;
        }
        if let Ok(mut slot) = stats_slot().lock() {
            *slot = None;
        }
    }
}

/// The [`Reporter`] every engine call of this crate runs with.
pub(super) struct BitReporter;

impl Reporter for BitReporter {
    fn emit(event: &LogEvent) {
        accumulate_stats(event);
        // A poisoned lock silently stops the output: a reporter problem must
        // never fail an install.
        if let Ok(mut slot) = renderer_slot().lock()
            && let Some(renderer) = slot.as_mut()
        {
            renderer.handle(event);
        }
    }
}

fn accumulate_stats(event: &LogEvent) {
    let LogEvent::Stats(log) = event else { return };
    let Ok(mut slot) = stats_slot().lock() else { return };
    let Some(stats) = slot.as_mut() else { return };
    match &log.message {
        StatsMessage::Added { added, .. } => stats.added = stats.added.saturating_add(*added),
        StatsMessage::Removed { removed, .. } => {
            stats.removed = stats.removed.saturating_add(*removed);
        }
    }
}

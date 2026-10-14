//! Console output in Bit's CLI style: the `ora` loader Bit's logger drives
//! (`components/legacy/loader/loader.ts`, ora 5 with the `dots` spinner on
//! stdout), `chalk` colors and `pretty-time` durations.

use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

const FRAMES: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL: Duration = Duration::from_millis(80);

/// ANSI styles used by Bit's install output.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Style {
    Green,
    Yellow,
    Red,
    Cyan,
    Blue,
    Gray,
    Bold,
}

impl Style {
    const fn codes(self) -> (u8, u8) {
        match self {
            Self::Green => (32, 39),
            Self::Yellow => (33, 39),
            Self::Red => (31, 39),
            Self::Cyan => (36, 39),
            Self::Blue => (34, 39),
            Self::Gray => (90, 39),
            Self::Bold => (1, 22),
        }
    }
}

/// Receives every chunk of terminal output. The JavaScript entry point writes
/// it to `process.stdout`, so output stays ordered with Node's own writes and
/// follows the CLI server's stream (as `@pnpm/napi`'s `onOutput` does).
pub type Sink = Arc<dyn Fn(&str) + Send + Sync>;

/// The terminal Bit writes to.
pub struct Output {
    color: bool,
    tty: bool,
    loader: bool,
    sink: Sink,
    state: Arc<Mutex<Spinner>>,
    spinning: Arc<AtomicBool>,
}

#[derive(Default)]
struct Spinner {
    text: String,
    frame: usize,
    drawn: bool,
}

impl Output {
    #[must_use]
    pub fn new(color: bool, tty: bool, loader: bool, sink: Sink) -> Self {
        Self {
            color,
            tty,
            loader,
            sink,
            state: Arc::default(),
            spinning: Arc::new(AtomicBool::new(false)),
        }
    }

    /// `chalk.<style>(text)`; plain text when colors are off.
    #[must_use]
    pub fn paint(&self, style: Style, text: &str) -> String {
        if !self.color {
            return text.to_string();
        }
        let (open, close) = style.codes();
        // chalk re-opens the outer style after a nested style closes it.
        let nested =
            text.replace(&format!("\u{1b}[{close}m"), &format!("\u{1b}[{close}m\u{1b}[{open}m"));
        format!("\u{1b}[{open}m{nested}\u{1b}[{close}m")
    }

    /// `logger.setStatusLine(text)`: restart the loader with `text`.
    pub fn status(&self, text: &str) {
        self.stop();
        if !self.loader {
            return;
        }
        lock(&self.state).text = text.to_string();
        if !self.tty {
            self.line(&format!("- {text}"));
            return;
        }
        self.spinning.store(true, Ordering::SeqCst);
        let state = Arc::clone(&self.state);
        let spinning = Arc::clone(&self.spinning);
        let sink = Arc::clone(&self.sink);
        thread::spawn(move || {
            while spinning.load(Ordering::SeqCst) {
                render(&mut lock(&state), &sink);
                thread::sleep(FRAME_INTERVAL);
            }
        });
    }

    /// `logger.console(message)` while the loader is on: persist `message`
    /// without a symbol.
    pub fn console(&self, message: &str) {
        if self.loader {
            self.persist(" ", message);
        } else {
            self.print(message);
        }
    }

    /// `logger.consoleSuccess(message, startTime)`.
    pub fn success(&self, message: &str, started: Option<Instant>) {
        let message = match started {
            Some(started) => format!("{message} (completed in {})", pretty_time(started.elapsed())),
            None => message.to_string(),
        };
        self.persist(&self.symbol('✔', Style::Green), &message);
    }

    /// `logger.consoleWarning(message)`.
    pub fn warning(&self, message: &str) {
        self.persist(&self.symbol('⚠', Style::Yellow), &self.paint(Style::Yellow, message));
    }

    /// `logger.consoleFailure(message)`.
    pub fn failure(&self, message: &str) {
        self.persist(&self.symbol('✖', Style::Red), message);
    }

    /// `logger.off()` before the package manager writes its own output.
    pub fn stop(&self) {
        self.spinning.store(false, Ordering::SeqCst);
        let mut state = lock(&self.state);
        if state.drawn {
            (self.sink)("\r\u{1b}[2K");
            state.drawn = false;
        }
    }

    /// Write `text` as is, after stopping the loader (`console.log`).
    pub fn print(&self, text: &str) {
        self.stop();
        self.line(text);
    }

    /// Where raw output goes, for the package manager's reporter.
    #[must_use]
    pub fn sink(&self) -> Sink {
        Arc::clone(&self.sink)
    }

    /// Write raw package manager output.
    pub fn raw(&self, text: &str) {
        self.stop();
        (self.sink)(text);
    }

    fn line(&self, text: &str) {
        (self.sink)(&format!("{text}\n"));
    }

    fn persist(&self, symbol: &str, text: &str) {
        self.stop();
        if !self.loader {
            return;
        }
        self.line(&format!("{symbol} {text}"));
    }

    fn symbol(&self, symbol: char, style: Style) -> String {
        self.paint(style, &symbol.to_string())
    }
}

impl Drop for Output {
    fn drop(&mut self) {
        self.stop();
    }
}

fn render(state: &mut Spinner, sink: &Sink) {
    let frame = FRAMES[state.frame % FRAMES.len()];
    state.frame += 1;
    sink(&format!("\r\u{1b}[2K{frame} {}", state.text));
    state.drawn = true;
}

fn lock(state: &Mutex<Spinner>) -> std::sync::MutexGuard<'_, Spinner> {
    state.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// `pretty-time` with its default precision: the largest whole unit only.
#[must_use]
pub fn pretty_time(duration: Duration) -> String {
    const UNITS: [(&str, u128); 6] = [
        ("h", 3_600_000_000_000),
        ("m", 60_000_000_000),
        ("s", 1_000_000_000),
        ("ms", 1_000_000),
        ("μs", 1_000),
        ("ns", 1),
    ];
    let nanos = duration.as_nanos();
    let (unit, size) = UNITS
        .iter()
        .find(|(_, size)| nanos >= *size)
        .unwrap_or(&UNITS[5]);
    format!("{}{unit}", nanos / size)
}

#[cfg(test)]
mod tests;

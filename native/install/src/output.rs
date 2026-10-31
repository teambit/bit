//! Console output in Bit's CLI style: the `ora` loader Bit's logger drives
//! (`components/legacy/loader/loader.ts`, ora 5 with the `dots` spinner on
//! stdout), `chalk` colors and `pretty-time` durations.

#[cfg(test)]
mod tests;

use std::{
    sync::{
        Arc, LazyLock, Mutex,
        atomic::{AtomicBool, AtomicU8, Ordering},
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
    /// Bit's loader exists (`loader.isStarted`): status and success lines print.
    /// The package manager step turns it on (`logger.on()` in `PnpmPackageManager`).
    loader: AtomicBool,
    /// `logger.shouldWriteToConsole`: console lines print while the loader is off.
    write_to_console: bool,
    /// `process.env.CI`: `logger.setStatusLine` prints nothing.
    ci: bool,
    sink: Sink,
}

/// Bit's single `loader`: every `Output` of the process drives it, so a command that
/// installs (`import`, `checkout`) and its installation never animate two spinners, and
/// the package manager step stops whichever is spinning.
static LOADER: LazyLock<Mutex<Spinner>> = LazyLock::new(Mutex::default);

/// `logger.off()` and `logger.on()` switch that one loader for every `Output`: until
/// either runs, each `Output` follows whether its command started a loader.
static SWITCHED: AtomicU8 = AtomicU8::new(UNSWITCHED);
const UNSWITCHED: u8 = 0;
const SWITCHED_ON: u8 = 1;
const SWITCHED_OFF: u8 = 2;

#[derive(Default)]
struct Spinner {
    text: String,
    frame: usize,
    /// The spinner line is on screen, written to `sink`.
    drawn: bool,
    /// Bumped by every start: a frame thread of an earlier start exits.
    generation: u64,
    spinning: bool,
    color: bool,
    sink: Option<Sink>,
}

impl Output {
    #[must_use]
    pub fn new(color: bool, tty: bool, loader: bool, sink: Sink) -> Self {
        Self {
            color,
            tty,
            loader: AtomicBool::new(loader),
            write_to_console: true,
            ci: false,
            sink,
        }
    }

    /// `logger.shouldWriteToConsole`: whether console lines print while the
    /// loader is off. `CommandRunner` turns it off together with the loader.
    #[must_use]
    pub fn with_console(mut self, write_to_console: bool) -> Self {
        self.write_to_console = write_to_console;
        self
    }

    /// Running on CI (`process.env.CI` set): status lines are not shown.
    #[must_use]
    pub fn with_ci(mut self, ci: bool) -> Self {
        self.ci = ci;
        self
    }

    /// `logger.on()`: from now on status and success lines print, for every `Output`.
    pub fn loader_on(&self) {
        self.loader.store(true, Ordering::SeqCst);
        SWITCHED.store(SWITCHED_ON, Ordering::SeqCst);
    }

    /// `logger.off()` before the package manager writes its own output: the loader
    /// stops, and status and success lines are dropped until `loader_on`, for every
    /// `Output`. A failed installation leaves it off.
    pub fn loader_off(&self) {
        self.stop();
        SWITCHED.store(SWITCHED_OFF, Ordering::SeqCst);
    }

    /// Mirror a retained published package manager's `logger.off()` after it
    /// failed: the Rust parent still renders the following graceful result.
    pub fn external_loader_off() {
        let mut spinner = lock();
        spinner.spinning = false;
        if spinner.drawn {
            if let Some(sink) = &spinner.sink {
                sink("\r\u{1b}[2K");
            }
            spinner.drawn = false;
        }
        SWITCHED.store(SWITCHED_OFF, Ordering::SeqCst);
    }

    fn loader(&self) -> bool {
        match SWITCHED.load(Ordering::SeqCst) {
            SWITCHED_ON => true,
            SWITCHED_OFF => false,
            _ => self.loader.load(Ordering::SeqCst),
        }
    }

    /// `chalk.<style>(text)`; plain text when colors are off.
    #[must_use]
    pub fn paint(&self, style: Style, text: &str) -> String {
        if !self.color || text.is_empty() {
            return text.to_string();
        }
        let (open, close) = style.codes();
        // chalk re-opens the outer style after a nested style closes it.
        let nested =
            text.replace(&format!("\u{1b}[{close}m"), &format!("\u{1b}[{close}m\u{1b}[{open}m"));
        let open = format!("\u{1b}[{open}m");
        let close = format!("\u{1b}[{close}m");
        let nested = encase_line_breaks(&nested, &close, &open);
        format!("{open}{nested}{close}")
    }

    /// `logger.setStatusLine(text)`: restart the loader with `text`; not on CI.
    pub fn status(&self, text: &str) {
        if self.ci {
            return;
        }
        self.restart(text);
    }

    /// `loader.setTextAndRestart(text)`, which shows on CI too (the
    /// `running command` line of `CommandRunner`).
    pub fn restart(&self, text: &str) {
        self.stop();
        if !self.loader() {
            return;
        }
        lock().text = text.to_string();
        if !self.tty {
            self.line(&format!("- {text}"));
            return;
        }
        let generation = {
            let mut spinner = lock();
            spinner.generation += 1;
            spinner.spinning = true;
            spinner.color = self.color;
            spinner.sink = Some(Arc::clone(&self.sink));
            spinner.generation
        };
        thread::spawn(move || {
            while render(&mut lock(), generation) {
                thread::sleep(FRAME_INTERVAL);
            }
        });
    }

    /// `logger.console(message)`: persisted without a symbol while the loader
    /// is on, printed when only console writing is on, dropped otherwise.
    pub fn console(&self, message: &str) {
        if self.loader() {
            self.persist(" ", message);
        } else if self.write_to_console {
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

    /// `logger.consoleSuccess()` without a message uses the loader's retained text.
    pub fn success_status(&self) {
        let message = lock().text.clone();
        self.success(&message, None);
    }

    /// Carry the current native command's actual loader text into a retained
    /// published class invocation, whose Node loader is in the same command.
    #[must_use]
    pub fn retained_text() -> String {
        lock().text.clone()
    }

    /// `logger.consoleWarning(message)`.
    pub fn warning(&self, message: &str) {
        self.persist(&self.symbol('⚠', Style::Yellow), &self.paint(Style::Yellow, message));
    }

    /// `logger.consoleFailure(message)`.
    pub fn failure(&self, message: &str) {
        self.persist(&self.symbol('✖', Style::Red), message);
    }

    /// Stop the spinner and clear its line (`loader.stop()`).
    pub fn stop(&self) {
        let mut spinner = lock();
        spinner.spinning = false;
        if spinner.drawn {
            if let Some(sink) = &spinner.sink {
                sink("\r\u{1b}[2K");
            }
            spinner.drawn = false;
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
        if !self.loader() {
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

/// Draw the next frame of the start `generation`; `false` once it stopped or restarted.
fn render(spinner: &mut Spinner, generation: u64) -> bool {
    if !spinner.spinning || spinner.generation != generation {
        return false;
    }
    let Some(sink) = spinner.sink.clone() else { return false };
    let frame = FRAMES[spinner.frame % FRAMES.len()];
    spinner.frame += 1;
    // ora's default spinner color.
    let frame =
        if spinner.color { format!("\u{1b}[36m{frame}\u{1b}[39m") } else { frame.to_string() };
    sink(&format!("\r\u{1b}[2K{frame} {}", spinner.text));
    spinner.drawn = true;
    true
}

fn lock() -> std::sync::MutexGuard<'static, Spinner> {
    LOADER.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// `pretty-time` with its default precision: the largest unit, rounded.
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
    format!("{}{unit}", (nanos + size / 2) / size)
}

/// Chalk closes and reopens styles around LF and CRLF without coloring the line ending.
fn encase_line_breaks(text: &str, close: &str, open: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut lines = text.split('\n').peekable();
    while let Some(line) = lines.next() {
        if lines.peek().is_none() {
            output.push_str(line);
            break;
        }
        let (line, ending) = line
            .strip_suffix('\r')
            .map_or((line, "\n"), |line| (line, "\r\n"));
        for part in [line, close, ending, open] {
            output.push_str(part);
        }
    }
    output
}

//! `@teambit/cli`'s output formatter (`output-formatter.ts`).

use crate::commands::color::Chalk;

pub struct Formatter {
    pub chalk: Chalk,
}

impl Formatter {
    pub const fn new(chalk: Chalk) -> Self {
        Self { chalk }
    }

    /// `successSymbol()`: `✓` on Windows.
    fn success_symbol(&self) -> String {
        self.chalk.green(if cfg!(windows) { "\u{2713}" } else { "\u{2714}" })
    }

    /// `warnSymbol`.
    /// `errorSymbol`.
    pub fn error_symbol(&self) -> String {
        self.chalk.red("\u{2716}")
    }

    pub fn warn_symbol(&self) -> String {
        self.chalk.yellow("\u{26A0}")
    }

    /// `formatItem(text)`: indented, with the dim bullet.
    pub fn item(&self, text: &str) -> String {
        Self::item_with(text, &self.chalk.dim("\u{203A}"))
    }

    /// `formatItem(text, symbol)`.
    pub fn item_with(text: &str, symbol: &str) -> String {
        format!("   {symbol} {text}")
    }

    /// `formatSection(title, description, items)`.
    pub fn section(&self, title: &str, description: &str, items: &[String]) -> String {
        if items.is_empty() {
            return String::new();
        }
        let mut lines = vec![self.title(&format!("{} ({})", title.trim(), items.len()))];
        if !description.trim().is_empty() {
            let indented: Vec<String> = description
                .lines()
                .map(|line| format!("  {line}"))
                .collect();
            lines.push(self.chalk.dim(&indented.join("\n")));
        }
        lines.extend(items.iter().cloned());
        lines.join("\n")
    }

    /// `formatTitle(text)`: bold white.
    pub fn title(&self, text: &str) -> String {
        self.chalk.bold_white(text)
    }

    /// `formatHint(text)`: dim.
    pub fn hint(&self, text: &str) -> String {
        self.chalk.dim(text)
    }

    /// `formatDetailsHint(subject)`.
    pub fn details_hint(&self, subject: &str) -> String {
        self.hint(&format!(r#"(run "bit details" to see {})"#, subject.trim()))
    }

    /// `formatSuccessSummary(msg)`.
    pub fn success_summary(&self, message: &str) -> String {
        format!("{} {}", self.success_symbol(), self.chalk.green(message))
    }

    /// `joinSections(sections)`: the non-empty ones, a blank line apart.
    pub fn join(sections: &[String]) -> String {
        sections
            .iter()
            .filter(|section| !section.trim().is_empty())
            .cloned()
            .collect::<Vec<_>>()
            .join("\n\n")
    }
}

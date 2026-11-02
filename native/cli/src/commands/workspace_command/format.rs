//! `@teambit/cli`'s output formatter (`output-formatter.ts`).
//!
//! [`Formatter`] provides section titles, bullet lists, and [`Formatter::error_symbol`] status symbols styled with [`Chalk`].

use crate::commands::color::Chalk;

/// Output formatter mirroring `@teambit/cli` section and status symbol helpers.
#[derive(Debug, Clone)]
pub struct Formatter {
    pub chalk: Chalk,
}

impl Formatter {
    /// Creates a [`Formatter`] using `chalk` for ANSI styling.
    #[must_use]
    #[inline]
    pub const fn new(chalk: Chalk) -> Self {
        Self { chalk }
    }

    /// `successSymbol()`: `✓` on Windows.
    #[inline]
    fn success_symbol(&self) -> String {
        self.chalk.green(if cfg!(windows) { "\u{2713}" } else { "\u{2714}" })
    }

    /// `warnSymbol`.
    /// `errorSymbol`.
    #[must_use]
    #[inline]
    pub fn error_symbol(&self) -> String {
        self.chalk.red("\u{2716}")
    }

    /// Returns the yellow warning symbol (`⚠`).
    #[must_use]
    #[inline]
    pub fn warn_symbol(&self) -> String {
        self.chalk.yellow("\u{26A0}")
    }

    /// `formatItem(text)`: indented, with the dim bullet.
    #[must_use]
    #[inline]
    pub fn item(&self, text: &str) -> String {
        Self::item_with(text, &self.chalk.dim("\u{203A}"))
    }

    /// `formatItem(text, symbol)`.
    #[must_use]
    #[inline]
    pub fn item_with(text: &str, symbol: &str) -> String {
        format!("   {symbol} {text}")
    }

    /// `formatSection(title, description, items)`.
    #[must_use]
    pub fn section(&self, title: &str, description: &str, items: &[String]) -> String {
        let non_empty: Vec<&str> = items
            .iter()
            .map(String::as_str)
            .filter(|item| !item.trim().is_empty())
            .collect();
        if non_empty.is_empty() {
            return String::new();
        }
        let heading = self.title(&format!("{} ({})", title.trim(), non_empty.len()));
        let description = description.trim();
        let desc_line = (!description.is_empty()).then(|| {
            let indented: Vec<String> = description
                .lines()
                .map(|line| format!("  {}", line.trim_end()))
                .collect();
            self.chalk.dim(&indented.join("\n"))
        });
        let mut lines = Vec::with_capacity(non_empty.len() + 2);
        lines.push(heading.as_str());
        if let Some(desc) = &desc_line {
            lines.push(desc.as_str());
        }
        lines.extend(non_empty);
        lines.join("\n")
    }

    /// `formatTitle(text)`: bold white.
    #[must_use]
    #[inline]
    pub fn title(&self, text: &str) -> String {
        self.chalk.bold_white(text)
    }

    /// `formatHint(text)`: dim.
    #[must_use]
    #[inline]
    pub fn hint(&self, text: &str) -> String {
        self.chalk.dim(text)
    }

    /// `formatDetailsHint(subject)`.
    #[must_use]
    #[inline]
    pub fn details_hint(&self, subject: &str) -> String {
        self.hint(&format!(r#"(run "bit details" to see {})"#, subject.trim()))
    }

    /// `formatSuccessSummary(msg)`.
    #[must_use]
    #[inline]
    pub fn success_summary(&self, message: &str) -> String {
        format!("{} {}", self.success_symbol(), self.chalk.green(message))
    }

    /// `joinSections(sections)`: the non-empty ones, a blank line apart.
    #[must_use]
    #[inline]
    pub fn join(sections: &[String]) -> String {
        sections
            .iter()
            .map(String::as_str)
            .filter(|section| !section.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n\n")
    }
}

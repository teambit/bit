//! Render the released final tester summary from the native aggregate.
use crate::commands::color::Chalk;
use serde_json::Value;
use std::{ffi::OsString, fmt::Write};

struct Summary<'a>(&'a Value);
impl Summary<'_> {
    fn number(&self, key: &str) -> u64 {
        self.0["totals"][key].as_u64().unwrap_or(0)
    }
    fn counts(&self) -> (usize, usize) {
        let rows = self.0["componentsWithTests"]
            .as_array()
            .map_or(&[][..], Vec::as_slice);
        let failed = rows
            .iter()
            .filter(|row| row["failed"].as_u64().unwrap_or(0) > 0)
            .count();
        let errors = rows
            .iter()
            .filter(|row| row["failed"] == 0 && row["hasError"] == true)
            .count();
        (failed, errors)
    }
    fn suffix(&self) -> String {
        let mut parts = Vec::new();
        let without = self.number("withoutTests");
        let affected = self.number("affectedByEnvError");
        if without > 0 {
            parts.push(format!("{without} without tests"));
        }
        if affected > 0 {
            parts.push(format!("{affected} not tested due to tester errors"));
        }
        if parts.is_empty() { String::new() } else { format!(", {}", parts.join(", ")) }
    }
    fn pending(&self) -> String {
        let pending = self.number("testsPending");
        if pending > 0 { format!(", {pending} pending") } else { String::new() }
    }
    fn passed(&self, components: u64) -> String {
        let passed = self.number("testsPassed");
        let total = passed + self.number("testsFailed") + self.number("testsPending");
        format!("{passed}/{total} tests passed across {components} components")
    }
    fn failed(&self, failed_components: usize, errors: usize) -> String {
        let failed = self.number("testsFailed");
        let tested = self.number("tested");
        let extra = if errors > 0 {
            format!(" (+{errors} components had tester errors)")
        } else {
            String::new()
        };
        format!(
            "{failed} tests failed across {failed_components} of {tested} components{extra}{}{}",
            self.pending(),
            self.suffix(),
        )
    }
    fn error_headline(&self, failed: usize, errors: usize) -> String {
        if self.number("testsFailed") > 0 {
            return self.failed(failed, errors);
        }
        if self.number("testsPassed") > 0 {
            let passed = self.passed(
                self.number("tested")
                    .saturating_sub(errors as u64),
            );
            return format!(
                "{passed}, but {errors} components had tester errors{}{}",
                self.pending(),
                self.suffix(),
            );
        }
        let attempted = self.number("tested") + self.number("affectedByEnvError");
        let targeted = if attempted > 0 { attempted } else { self.number("totalComponents") };
        format!("tester errors encountered ({targeted} components targeted{})", self.suffix())
    }
    fn has_errors(&self, failed: usize, errors: usize) -> bool {
        self.number("testsFailed") > 0
            || failed + errors > 0
            || self.0["envErrors"]
                .as_array()
                .is_some_and(|rows| !rows.is_empty())
    }
    fn ordinary(&self, code: i32) -> (String, bool, bool) {
        let tested = self.number("tested");
        let passed = format!("{}{}{}", self.passed(tested), self.pending(), self.suffix());
        if code != 0 {
            let message = if tested > 0 {
                passed
            } else {
                format!("no test failures reported{}", self.suffix())
            };
            return (
                format!(
                    "{message}, but tester exited with a non-zero code (e.g. coverage threshold not met)",
                ),
                true,
                false,
            );
        }
        if tested == 0 {
            let total = self.number("totalComponents");
            let message = if total == 0 {
                "no components to test".to_owned()
            } else {
                format!("no tests found ({total} components, none with tests)")
            };
            return (message, false, true);
        }
        (passed, false, false)
    }
    fn headline(&self, code: i32) -> (String, bool, bool) {
        let (failed, errors) = self.counts();
        if self.has_errors(failed, errors) {
            (self.error_headline(failed, errors), true, false)
        } else {
            self.ordinary(code)
        }
    }
}
pub(super) fn format_report(
    value: &Value,
    code: i32,
    elapsed_ms: u128,
    chalk: Chalk,
    args: &[OsString],
) -> String {
    let summary = format_summary(value, code, elapsed_ms, chalk);
    let flags: Vec<_> = args
        .iter()
        .take_while(|arg| *arg != "--")
        .collect();
    if flags
        .iter()
        .any(|arg| *arg == "--summary")
    {
        return summary;
    }
    let mut sections = Vec::new();
    result_sections(value, chalk, &mut sections);
    no_tests_section(
        value,
        chalk,
        flags
            .iter()
            .any(|arg| *arg == "--verbose"),
        &mut sections,
    );
    sections.push(summary);
    format!("\n{}", sections.join("\n\n"))
}
fn result_sections(value: &Value, chalk: Chalk, sections: &mut Vec<String>) {
    let tested = value["componentsWithTests"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    if !tested.is_empty() {
        let mut tested = tested.iter().collect::<Vec<_>>();
        tested.sort_by(|left, right| {
            crate::commands::status::collate::compare(
                left["id"].as_str().unwrap_or_default(),
                right["id"].as_str().unwrap_or_default(),
            )
        });
        let lines = tested
            .into_iter()
            .map(|row| component_line(row, chalk))
            .collect::<Vec<_>>()
            .join("\n");
        sections.push(format!("{}\n{lines}", chalk.bold_white("test results")));
    }
    let errors = value["envErrors"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    if !errors.is_empty() {
        let symbol = chalk.red("✖");
        let mut section = format!("{symbol} {}", chalk.bold_white("tester errors"));
        for error in errors {
            let env_id = error["envId"]
                .as_str()
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .unwrap_or("unknown env");
            let msg = error["message"]
                .as_str()
                .map(str::trim)
                .filter(|msg| !msg.is_empty())
                .unwrap_or("undefined");
            let _ = write!(section, "\n   {symbol} {env_id}: {msg}");
        }
        sections.push(section);
    }
}
fn no_tests_section(value: &Value, chalk: Chalk, verbose: bool, sections: &mut Vec<String>) {
    let ids = value["componentsWithoutTests"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let mut names = ids
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .collect::<Vec<_>>();
    names.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    let hint = if verbose {
        format!("{} components have no tests", names.len())
    } else {
        format!("{} components have no tests (run with --verbose to list)", names.len())
    };
    if !names.is_empty() {
        let mut section = chalk.dim(&hint);
        if verbose {
            for name in names {
                let _ = write!(section, "\n   {} {name}", chalk.dim("›"));
            }
        }
        sections.push(section);
    }
}
fn component_line(row: &Value, chalk: Chalk) -> String {
    let failed = row["failed"].as_u64().unwrap_or(0);
    let passed = row["passed"].as_u64().unwrap_or(0);
    let pending = row["pending"].as_u64().unwrap_or(0);
    let parts = [(failed, "failed"), (passed, "passed"), (pending, "pending")]
        .into_iter()
        .filter(|(count, _)| *count > 0)
        .map(|(count, label)| format!("{count} {label}"))
        .collect::<Vec<_>>();
    let stats =
        if parts.is_empty() { "no test counts reported".to_owned() } else { parts.join(", ") };
    let text = format!("{} — {stats}", row["id"].as_str().unwrap_or_default());
    if failed > 0 {
        format!("   {} {text}", chalk.red("✖"))
    } else if row["hasError"] == true {
        format!("   {} {text} (tester reported errors)", chalk.yellow("⚠"))
    } else {
        format!("   {} {text}", chalk.green(if cfg!(windows) { "✓" } else { "✔" }))
    }
}
fn format_summary(value: &Value, code: i32, elapsed_ms: u128, chalk: Chalk) -> String {
    let (message, warning, hint) = Summary(value).headline(code);
    let line = if hint {
        chalk.dim(&message)
    } else if warning {
        format!("{} {}", chalk.yellow("⚠"), chalk.yellow(&message))
    } else {
        format!("{} {}", chalk.green(if cfg!(windows) { "✓" } else { "✔" }), chalk.green(&message))
    };
    let seconds = elapsed_ms as f64 / 1000.0;
    format!("{line}\n{}", chalk.dim(&format!("Finished. ({seconds}s)")))
}

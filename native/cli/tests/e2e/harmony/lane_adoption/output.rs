//! Only validated duration tokens on named released completion lines vary.
pub(crate) fn durations(text: &str) -> String {
    text.split_inclusive('\n')
        .map(completion)
        .collect()
}
fn completion(line: &str) -> String {
    let (body, newline) = if let Some(body) = line.strip_suffix("\r\n") {
        (body, "\r\n")
    } else {
        line.strip_suffix('\n')
            .map_or((line, ""), |body| (body, "\n"))
    };
    let plain = body.strip_prefix("\u{1b}[K\u{1b}[0J").unwrap_or(body);
    let Some(duration) = completion_duration(plain) else { return line.to_owned() };
    let duration = duration.strip_suffix(')').expect("canonical completion suffix");
    validate_duration(duration);
    let start = body.len() - duration.len() - 1;
    format!("{}<duration>){newline}", &body[..start])
}
fn completion_duration(body: &str) -> Option<&str> {
    for symbol in ["✔", "✓"] {
        for action in [
            "importing components",
            "linking components",
            "done running package installation using pnpm",
            "compiling components",
        ] {
            let prefix = format!("{symbol} {action} (completed in ");
            if let Some(duration) = body.strip_prefix(&prefix) {
                return Some(duration);
            }
        }
    }
    None
}
fn validate_duration(duration: &str) {
    let numeric = duration
        .bytes()
        .take_while(|byte| byte.is_ascii_digit() || *byte == b'.')
        .count();
    let value = &duration[..numeric];
    assert!(
        !value.is_empty()
            && !value.starts_with('.')
            && !value.ends_with('.')
            && value
                .bytes()
                .filter(|byte| *byte == b'.')
                .count()
                <= 1,
        "invalid completion number: {duration}",
    );
    assert!(
        ["ns", "μs", "µs", "ms", "s", "m", "h"].contains(&&duration[numeric..]),
        "invalid completion unit: {duration}",
    );
}

#[cfg(test)]
mod tests {
    use super::durations;

    #[test]
    fn completion_tokens_preserve_all_other_bytes_and_line_endings() {
        assert_eq!(
            durations(
                "- importing components\n✔ importing components (completed in 19μs)\r\nremaining\n"
            ),
            "- importing components\n✔ importing components (completed in <duration>)\r\nremaining\n",
        );
        assert_eq!(
            durations("\u{1b}[K\u{1b}[0J✔ compiling components (completed in 1.2s)\n"),
            "\u{1b}[K\u{1b}[0J✔ compiling components (completed in <duration>)\n",
        );
        let unrelated = "✔ unknown action (completed in 20ms)\nProgress: resolved 1\n";
        assert_eq!(durations(unrelated), unrelated);
    }
}

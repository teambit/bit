//! Only the released import completion line's validated duration token varies.
pub(super) fn durations(text: &str) -> String {
    text.split_inclusive('\n')
        .map(completion)
        .collect()
}
fn completion(line: &str) -> String {
    let body = line.trim_end_matches(['\r', '\n']);
    let plain = body.strip_prefix("\u{1b}[K\u{1b}[0J").unwrap_or(body);
    let Some(duration) = plain
        .strip_prefix("✔ importing components (completed in ")
        .or_else(|| plain.strip_prefix("✓ importing components (completed in "))
        .and_then(|value| value.strip_suffix(')'))
    else {
        return line.into();
    };
    if !valid_duration(duration) {
        return line.into();
    }
    let start = body.len() - duration.len() - 1;
    format!("{}<duration>){}", &body[..start], &line[body.len()..])
}
fn valid_duration(duration: &str) -> bool {
    let count = duration
        .bytes()
        .take_while(|byte| byte.is_ascii_digit() || *byte == b'.')
        .count();
    let number = &duration[..count];
    !number.is_empty()
        && !number.starts_with('.')
        && !number.ends_with('.')
        && number
            .bytes()
            .filter(|byte| *byte == b'.')
            .count()
            <= 1
        && ["ns", "μs", "µs", "ms", "s", "m", "h"].contains(&&duration[count..])
}

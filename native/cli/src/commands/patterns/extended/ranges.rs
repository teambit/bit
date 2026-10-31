//! `brace-expansion` numeric/alphabetic sequences, before minimatch parsing.

use crate::commands::status::js::decline;
use std::io;

const LIMIT: usize = 4096;

pub(super) fn expand(pattern: &str) -> io::Result<Vec<String>> {
    if pattern.len() > LIMIT {
        return Err(decline("component pattern expansion limit"));
    }
    let Some((open, close, range)) = sequence(pattern)? else {
        return Ok(vec![pattern.to_string()]);
    };
    let mut expanded = Vec::new();
    for value in range.values()? {
        let next = format!("{}{value}{}", &pattern[..open], &pattern[close + 1..]);
        expanded.extend(expand(&next)?);
        if expanded.len() > LIMIT {
            return Err(decline("component pattern expansion limit"));
        }
    }
    Ok(expanded)
}

fn sequence(pattern: &str) -> io::Result<Option<(usize, usize, Sequence)>> {
    for (open, _) in pattern
        .char_indices()
        .rev()
        .filter(|(_, character)| *character == '{')
    {
        if pattern[..open]
            .chars()
            .rev()
            .take_while(|character| *character == '\\')
            .count()
            % 2
            == 1
        {
            continue;
        }
        let Some(close) = pattern[open..]
            .find('}')
            .map(|offset| open + offset)
        else {
            continue;
        };
        let values: Vec<_> = pattern[open + 1..close].split("..").collect();
        if let Some(range) = Sequence::parse(&values)? {
            return Ok(Some((open, close, range)));
        }
    }
    Ok(None)
}

struct Sequence {
    start: i64,
    end: i64,
    step: i64,
    width: usize,
    letters: bool,
}
impl Sequence {
    fn parse(parts: &[&str]) -> io::Result<Option<Self>> {
        if !(2..=3).contains(&parts.len()) {
            return Ok(None);
        }
        let numeric = parts[..2].iter().all(|part| numeric_endpoint(part));
        let numbers = numeric
            .then(|| {
                parts[0]
                    .parse::<i64>()
                    .ok()
                    .zip(parts[1].parse::<i64>().ok())
            })
            .flatten();
        if numeric && numbers.is_none() {
            return Err(decline("component pattern sequence magnitude"));
        }
        let letters = letter(parts[0]).zip(letter(parts[1]));
        let Some((start, end)) = numbers.or(letters) else { return Ok(None) };
        let step = parts
            .get(2)
            .map_or(Some(1), |step| {
                numeric_endpoint(step)
                    .then(|| step.parse::<i64>().ok())
                    .flatten()
            });
        let Some(step) = step else { return Ok(None) };
        let step = step
            .checked_abs()
            .ok_or_else(|| decline("component pattern sequence step"))?
            .max(1);
        let width = padded_width(&parts[..2], numbers.is_some());
        Ok(Some(Self { start, end, step, width, letters: numbers.is_none() }))
    }

    fn values(&self) -> io::Result<Vec<String>> {
        let step = i128::from(self.step.max(1));
        let distance = (i128::from(self.end) - i128::from(self.start)).abs();
        if distance / step >= LIMIT as i128 {
            return Err(decline("component pattern expansion limit"));
        }
        let direction = if self.end < self.start { -1 } else { 1 };
        let mut value = i128::from(self.start);
        let mut output = Vec::new();
        while if direction > 0 {
            value <= i128::from(self.end)
        } else {
            value >= i128::from(self.end)
        } {
            output.push(self.format(value)?);
            value += direction * step;
        }
        Ok(output)
    }

    fn format(&self, value: i128) -> io::Result<String> {
        if self.letters {
            let number =
                u32::try_from(value).map_err(|_| decline("component pattern letter sequence"))?;
            let letter =
                char::from_u32(number).ok_or_else(|| decline("component pattern letter sequence"))?;
            Ok(if letter == '\\' { String::new() } else { letter.to_string() })
        } else {
            Ok(format!("{value:0width$}", width = self.width))
        }
    }
}

fn letter(value: &str) -> Option<i64> {
    let mut chars = value.chars();
    let letter = chars.next()?;
    (letter.is_ascii_alphabetic() && chars.next().is_none()).then_some(i64::from(u32::from(letter)))
}

fn numeric_endpoint(value: &str) -> bool {
    let digits = value
        .strip_prefix('-')
        .or_else(|| value.strip_prefix('+'))
        .unwrap_or(value);
    !digits.is_empty() && digits.bytes().all(|byte| byte.is_ascii_digit())
}

fn padded_width(parts: &[&str], is_numeric: bool) -> usize {
    let padded = parts
        .iter()
        .any(|part| {
            let unsigned = part.trim_start_matches(['-', '+']);
            unsigned.starts_with('0') && unsigned.len() > 1
        });
    if is_numeric && padded {
        parts[0]
            .trim_start_matches('+')
            .len()
            .max(parts[1].trim_start_matches('+').len())
    } else {
        0
    }
}

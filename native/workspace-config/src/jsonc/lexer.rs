//! The subset of esprima's tokenizer comment-json relies on: punctuators,
//! JSON literals and comments, each with the lines it starts and ends on.

use std::{io, iter::Peekable, str::CharIndices};

#[derive(Debug, Clone, PartialEq)]
pub(super) enum Kind {
    Punct(char),
    String(String),
    /// The unsigned numeric literal; a leading `-` is its own punctuator.
    Number(f64),
    Bool(bool),
    Null,
    Line(String),
    Block(String),
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct Token {
    pub(super) kind: Kind,
    pub(super) start_line: usize,
    pub(super) end_line: usize,
}

pub(super) fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message.into())
}

struct Lexer<'a> {
    text: &'a str,
    chars: Peekable<CharIndices<'a>>,
    line: usize,
}

pub(super) fn tokenize(text: &str) -> io::Result<Vec<Token>> {
    let mut lexer = Lexer { text, chars: text.char_indices().peekable(), line: 1 };
    let mut tokens = Vec::new();
    while let Some(token) = lexer.next_token()? {
        tokens.push(token);
    }
    Ok(tokens)
}

fn is_line_terminator(char: char) -> bool {
    matches!(char, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

impl Lexer<'_> {
    fn bump_line(&mut self, char: char) {
        if char == '\r'
            && self.chars
                .peek()
                .is_some_and(|(_, next)| *next == '\n')
        {
            return;
        }
        if is_line_terminator(char) {
            self.line += 1;
        }
    }

    fn next_token(&mut self) -> io::Result<Option<Token>> {
        while let Some(&(start, char)) = self.chars.peek() {
            if char.is_whitespace() || char == '\u{feff}' {
                self.chars.next();
                self.bump_line(char);
                continue;
            }
            let start_line = self.line;
            let kind = self.kind(start, char)?;
            return Ok(Some(Token { kind, start_line, end_line: self.line }));
        }
        Ok(None)
    }

    fn kind(&mut self, start: usize, char: char) -> io::Result<Kind> {
        match char {
            '{' | '}' | '[' | ']' | ':' | ',' | '-' => {
                self.chars.next();
                Ok(Kind::Punct(char))
            }
            '"' | '\'' => self.string(start, char),
            '/' => self.comment(start),
            '0'..='9' | '.' => self.number(start),
            _ if char.is_alphabetic() || char == '_' || char == '$' => self.word(start),
            _ => Err(invalid(format!("Unexpected token {char}"))),
        }
    }

    fn take_while(&mut self, start: usize, mut keep: impl FnMut(char) -> bool) -> &str {
        let mut end = start;
        while let Some(&(index, char)) = self.chars.peek() {
            if !keep(char) {
                break;
            }
            end = index + char.len_utf8();
            self.chars.next();
        }
        &self.text[start..end]
    }

    fn string(&mut self, start: usize, quote: char) -> io::Result<Kind> {
        self.chars.next();
        let mut escaped = false;
        for (index, char) in self.chars.by_ref() {
            if is_line_terminator(char) {
                break;
            }
            if escaped {
                escaped = false;
            } else if char == '\\' {
                escaped = true;
            } else if char == quote {
                let raw = &self.text[start..=index];
                // `JSON.parse` of the raw token: single quotes are rejected here.
                return serde_json::from_str(raw)
                    .map(Kind::String)
                    .map_err(|_| invalid(format!("Unexpected token {quote}")));
            }
        }
        Err(invalid("Unexpected token ILLEGAL"))
    }

    fn comment(&mut self, start: usize) -> io::Result<Kind> {
        self.chars.next();
        match self.chars.next() {
            Some((_, '/')) => {
                let value = self.take_while(start + 2, |char| !is_line_terminator(char));
                Ok(Kind::Line(value.to_owned()))
            }
            Some((_, '*')) => self.block(start + 2),
            _ => Err(invalid("Unexpected token /")),
        }
    }

    fn block(&mut self, body: usize) -> io::Result<Kind> {
        while let Some((index, char)) = self.chars.next() {
            if char == '*'
                && self.chars
                    .peek()
                    .is_some_and(|(_, next)| *next == '/')
            {
                self.chars.next();
                return Ok(Kind::Block(self.text[body..index].to_owned()));
            }
            self.bump_line(char);
        }
        Err(invalid("Unexpected token ILLEGAL"))
    }

    fn number(&mut self, start: usize) -> io::Result<Kind> {
        let mut previous = ' ';
        let raw = self.take_while(start, |char| {
            let keep = char.is_ascii_alphanumeric()
                || char == '.'
                || (matches!(char, '+' | '-') && matches!(previous, 'e' | 'E'));
            previous = char;
            keep
        });
        if !is_json_number(raw) {
            return Err(invalid(format!("Unexpected token {}", &raw[..1])));
        }
        raw.parse()
            .map(Kind::Number)
            .map_err(|_| invalid("Unexpected number"))
    }

    fn word(&mut self, start: usize) -> io::Result<Kind> {
        let word =
            self.take_while(start, |char| char.is_alphanumeric() || char == '_' || char == '$');
        match word {
            "true" => Ok(Kind::Bool(true)),
            "false" => Ok(Kind::Bool(false)),
            "null" => Ok(Kind::Null),
            _ => Err(invalid(format!("Unexpected token {}", &word[..1]))),
        }
    }
}

/// `0 | [1-9][0-9]*`, optional fraction and exponent: what `JSON.parse` accepts
/// after an optional minus sign.
fn is_json_number(raw: &str) -> bool {
    let bytes = raw.as_bytes();
    let integer = digits(bytes);
    if integer == 0 || (integer > 1 && bytes[0] == b'0') {
        return false;
    }
    let rest = &bytes[integer..];
    let Some(fraction) = fraction(rest) else { return false };
    let rest = &rest[fraction..];
    exponent(rest) == Some(rest.len())
}

fn digits(bytes: &[u8]) -> usize {
    bytes
        .iter()
        .take_while(|byte| byte.is_ascii_digit())
        .count()
}

/// The length of an optional `.digits` part; `None` when the dot has no digits.
fn fraction(bytes: &[u8]) -> Option<usize> {
    let Some(rest) = bytes.strip_prefix(b".") else { return Some(0) };
    let count = digits(rest);
    (count > 0).then_some(count + 1)
}

/// The length of an optional `e[+-]digits` part; `None` when it has no digits.
fn exponent(bytes: &[u8]) -> Option<usize> {
    let Some(rest) = bytes
        .strip_prefix(b"e")
        .or_else(|| bytes.strip_prefix(b"E"))
    else {
        return Some(0);
    };
    let sign = usize::from(matches!(rest.first(), Some(b'+' | b'-')));
    let count = digits(&rest[sign..]);
    (count > 0).then_some(1 + sign + count)
}

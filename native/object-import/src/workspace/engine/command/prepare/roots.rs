//! Validate ownership boundaries before selecting or combining checkout targets.
use super::invalid;
use serde_json::Value;
use std::io;

pub(super) fn validate(targets: &[Value]) -> io::Result<()> {
    let mut roots = targets
        .iter()
        .map(|target| target["directory"].as_str().ok_or_else(|| invalid("command component root")))
        .collect::<io::Result<Vec<_>>>()?;
    roots.sort_unstable_by(|left, right| {
        std::path::Path::new(left).cmp(std::path::Path::new(right))
    });
    if roots
        .iter()
        .filter(|root| **root == ".")
        .count()
        > 1
    {
        return Err(invalid("command duplicate workspace root"));
    }
    roots.retain(|root| *root != ".");
    if roots
        .windows(2)
        .any(|pair| std::path::Path::new(pair[1]).starts_with(pair[0]))
    {
        return Err(invalid("command nested component roots"));
    }
    Ok(())
}

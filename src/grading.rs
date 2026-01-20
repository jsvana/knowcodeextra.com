//! Grading logic for test submissions
//!
//! Handles both question grading and copy text grading with prosign support.

use std::collections::HashMap;

/// Normalize text for comparison: uppercase, collapse whitespace, trim
pub fn normalize_text(text: &str) -> String {
    text.to_uppercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_text() {
        assert_eq!(normalize_text("hello world"), "HELLO WORLD");
        assert_eq!(normalize_text("  hello   world  "), "HELLO WORLD");
        assert_eq!(normalize_text("CQ CQ de W6JSV"), "CQ CQ DE W6JSV");
    }
}

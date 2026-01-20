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

/// Result of grading a single question
#[derive(Debug, Clone)]
pub struct QuestionResult {
    pub question_id: String,
    pub correct: bool,
    pub user_answer: Option<String>,
    pub correct_answer: String,
}

/// Grade question answers against correct answers
pub fn grade_questions(
    answers: &HashMap<String, String>,
    correct_answers: &HashMap<String, String>,
) -> (i32, Vec<QuestionResult>) {
    let mut score = 0;
    let mut results = Vec::new();

    for (question_id, correct_answer) in correct_answers {
        let user_answer = answers.get(question_id).cloned();
        let is_correct = user_answer
            .as_ref()
            .map(|a| a.to_uppercase() == correct_answer.to_uppercase())
            .unwrap_or(false);

        if is_correct {
            score += 1;
        }

        results.push(QuestionResult {
            question_id: question_id.clone(),
            correct: is_correct,
            user_answer,
            correct_answer: correct_answer.clone(),
        });
    }

    (score, results)
}

/// Expand prosigns in expected text to their alternates for matching
/// Returns a list of (position, prosign_length, alternates) for each prosign found
fn find_prosigns(text: &str, mappings: &[(String, String)]) -> Vec<(usize, usize, Vec<String>)> {
    let mut prosigns = Vec::new();
    let text_upper = text.to_uppercase();

    for (prosign, alternate) in mappings {
        let prosign_upper = prosign.to_uppercase();
        let mut start = 0;
        while let Some(pos) = text_upper[start..].find(&prosign_upper) {
            let actual_pos = start + pos;
            prosigns.push((
                actual_pos,
                prosign.len(),
                vec![prosign_upper.clone(), alternate.to_uppercase()],
            ));
            start = actual_pos + 1;
        }
    }

    // Sort by position
    prosigns.sort_by_key(|(pos, _, _)| *pos);
    prosigns
}

/// Find the longest consecutive correct character sequence
/// Uses sliding window algorithm to find best match anywhere in user text
pub fn find_consecutive_correct(
    user_text: &str,
    expected_text: &str,
    prosign_mappings: &[(String, String)],
) -> i32 {
    let user_norm = normalize_text(user_text);
    let expected_norm = normalize_text(expected_text);

    if user_norm.is_empty() || expected_norm.is_empty() {
        return 0;
    }

    let user_chars: Vec<char> = user_norm.chars().collect();
    let expected_chars: Vec<char> = expected_norm.chars().collect();

    // Find prosigns in normalized expected text
    let prosigns = find_prosigns(&expected_norm, prosign_mappings);

    let mut max_consecutive = 0;

    // Try starting from each position in expected text
    for exp_start in 0..expected_chars.len() {
        // Try matching against each position in user text
        for user_start in 0..user_chars.len() {
            let consecutive = count_consecutive_matches(
                &user_chars,
                user_start,
                &expected_chars,
                exp_start,
                &prosigns,
            );
            max_consecutive = max_consecutive.max(consecutive);
        }
    }

    max_consecutive as i32
}

/// Count consecutive matching characters starting from given positions
fn count_consecutive_matches(
    user_chars: &[char],
    user_start: usize,
    expected_chars: &[char],
    exp_start: usize,
    prosigns: &[(usize, usize, Vec<String>)],
) -> usize {
    let mut count = 0;
    let mut user_pos = user_start;
    let mut exp_pos = exp_start;

    while user_pos < user_chars.len() && exp_pos < expected_chars.len() {
        // Check if we're at a prosign position
        if let Some((_, prosign_len, alternates)) = prosigns
            .iter()
            .find(|(pos, _, _)| *pos == exp_pos)
        {
            // Try to match any of the alternates
            let mut matched = false;
            for alt in alternates {
                let alt_chars: Vec<char> = alt.chars().collect();
                if user_pos + alt_chars.len() <= user_chars.len() {
                    let user_slice: String = user_chars[user_pos..user_pos + alt_chars.len()]
                        .iter()
                        .collect();
                    if user_slice == *alt {
                        count += alt_chars.len();
                        user_pos += alt_chars.len();
                        exp_pos += prosign_len;
                        matched = true;
                        break;
                    }
                }
            }
            if !matched {
                break;
            }
        } else {
            // Regular character comparison
            if user_chars[user_pos] == expected_chars[exp_pos] {
                count += 1;
                user_pos += 1;
                exp_pos += 1;
            } else {
                break;
            }
        }
    }

    count
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

    #[test]
    fn test_grade_questions_all_correct() {
        let answers: HashMap<String, String> = [
            ("q1".to_string(), "A".to_string()),
            ("q2".to_string(), "B".to_string()),
        ].into_iter().collect();

        let correct: HashMap<String, String> = [
            ("q1".to_string(), "A".to_string()),
            ("q2".to_string(), "B".to_string()),
        ].into_iter().collect();

        let (score, _) = grade_questions(&answers, &correct);
        assert_eq!(score, 2);
    }

    #[test]
    fn test_grade_questions_case_insensitive() {
        let answers: HashMap<String, String> = [
            ("q1".to_string(), "a".to_string()),
        ].into_iter().collect();

        let correct: HashMap<String, String> = [
            ("q1".to_string(), "A".to_string()),
        ].into_iter().collect();

        let (score, _) = grade_questions(&answers, &correct);
        assert_eq!(score, 1);
    }

    #[test]
    fn test_grade_questions_missing_answer() {
        let answers: HashMap<String, String> = HashMap::new();

        let correct: HashMap<String, String> = [
            ("q1".to_string(), "A".to_string()),
        ].into_iter().collect();

        let (score, results) = grade_questions(&answers, &correct);
        assert_eq!(score, 0);
        assert!(!results[0].correct);
    }

    #[test]
    fn test_find_consecutive_correct_exact_match() {
        let result = find_consecutive_correct(
            "CQ CQ DE W6JSV",
            "CQ CQ DE W6JSV",
            &[],
        );
        assert_eq!(result, 14); // "CQ CQ DE W6JSV" normalized
    }

    #[test]
    fn test_find_consecutive_correct_partial_match() {
        let result = find_consecutive_correct(
            "GARBAGE CQ CQ DE W6JSV MORE GARBAGE",
            "CQ CQ DE W6JSV",
            &[],
        );
        assert_eq!(result, 14);
    }

    #[test]
    fn test_find_consecutive_correct_with_prosign() {
        let mappings = vec![("<BT>".to_string(), "=".to_string())];
        let result = find_consecutive_correct(
            "TEST = TEST",
            "TEST <BT> TEST",
            &mappings,
        );
        // "TEST = TEST" matches "TEST <BT> TEST" when = is alternate for <BT>
        assert!(result >= 11); // At least "TEST = TEST" length
    }

    #[test]
    fn test_find_consecutive_correct_prosign_as_prosign() {
        let mappings = vec![("<BT>".to_string(), "=".to_string())];
        let result = find_consecutive_correct(
            "TEST <BT> TEST",
            "TEST <BT> TEST",
            &mappings,
        );
        assert!(result >= 14);
    }

    #[test]
    fn test_find_consecutive_correct_case_insensitive() {
        let result = find_consecutive_correct(
            "cq cq de w6jsv",
            "CQ CQ DE W6JSV",
            &[],
        );
        assert_eq!(result, 14);
    }

    #[test]
    fn test_find_consecutive_correct_empty() {
        assert_eq!(find_consecutive_correct("", "TEST", &[]), 0);
        assert_eq!(find_consecutive_correct("TEST", "", &[]), 0);
    }
}

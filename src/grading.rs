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
}

import React, { useState, useEffect, useCallback } from "react";
import { API_BASE, getSegmentColor } from "./shared.jsx";
import { useAdminAuth } from "./admin-auth.jsx";

// Helper to parse time input (mm:ss or seconds) to seconds
const parseTimeToSeconds = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const str = String(value).trim();
  if (str === "") return null;
  if (str.includes(":")) {
    const parts = str.split(":");
    const minutes = parseInt(parts[0], 10) || 0;
    const seconds = parseInt(parts[1], 10) || 0;
    return minutes * 60 + seconds;
  }
  return parseFloat(str) || 0;
};

// Helper to format seconds as mm:ss
const formatSecondsToTime = (seconds) => {
  if (seconds === null || seconds === undefined) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export function QuestionForm({ question, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    question_number: question?.question_number || "",
    question_text: question?.question_text || "",
    option_a: question?.option_a || "",
    option_b: question?.option_b || "",
    option_c: question?.option_c || "",
    option_d: question?.option_d || "",
    correct_option: question?.correct_option || "A",
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...formData,
        question_number: parseInt(formData.question_number, 10),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="font-mono text-xs text-amber-700 block mb-1">
          QUESTION NUMBER
        </label>
        <input
          type="number"
          value={formData.question_number}
          onChange={(e) => handleChange("question_number", e.target.value)}
          className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-amber-900 focus:border-amber-500 focus:outline-none"
          required
          min="1"
        />
      </div>

      <div>
        <label className="font-mono text-xs text-amber-700 block mb-1">
          QUESTION TEXT
        </label>
        <textarea
          value={formData.question_text}
          onChange={(e) => handleChange("question_text", e.target.value)}
          className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-amber-900 focus:border-amber-500 focus:outline-none resize-y"
          rows={3}
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="font-mono text-xs text-amber-700 block mb-1">
            OPTION A
          </label>
          <input
            type="text"
            value={formData.option_a}
            onChange={(e) => handleChange("option_a", e.target.value)}
            className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-amber-900 focus:border-amber-500 focus:outline-none"
            required
          />
        </div>
        <div>
          <label className="font-mono text-xs text-amber-700 block mb-1">
            OPTION B
          </label>
          <input
            type="text"
            value={formData.option_b}
            onChange={(e) => handleChange("option_b", e.target.value)}
            className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-amber-900 focus:border-amber-500 focus:outline-none"
            required
          />
        </div>
        <div>
          <label className="font-mono text-xs text-amber-700 block mb-1">
            OPTION C
          </label>
          <input
            type="text"
            value={formData.option_c}
            onChange={(e) => handleChange("option_c", e.target.value)}
            className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-amber-900 focus:border-amber-500 focus:outline-none"
            required
          />
        </div>
        <div>
          <label className="font-mono text-xs text-amber-700 block mb-1">
            OPTION D
          </label>
          <input
            type="text"
            value={formData.option_d}
            onChange={(e) => handleChange("option_d", e.target.value)}
            className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-amber-900 focus:border-amber-500 focus:outline-none"
            required
          />
        </div>
      </div>

      <div>
        <label className="font-mono text-xs text-amber-700 block mb-1">
          CORRECT OPTION
        </label>
        <select
          value={formData.correct_option}
          onChange={(e) => handleChange("correct_option", e.target.value)}
          className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-amber-900 focus:border-amber-500 focus:outline-none bg-white"
        >
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
        </select>
      </div>

      <div className="flex gap-4 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-3 font-mono text-sm tracking-widest border-2 border-amber-300 text-amber-800 hover:border-amber-500 hover:bg-amber-100 transition-all"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 px-4 py-3 font-mono text-sm tracking-widest bg-amber-700 text-amber-50 hover:bg-amber-800 transition-all disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

// Segment Form Component for editing a single segment
export function SegmentForm({ segment, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    name: segment?.name || "",
    start_time: segment?.start_time != null ? formatSecondsToTime(segment.start_time) : "",
    end_time: segment?.end_time != null ? formatSecondsToTime(segment.end_time) : "",
    enables_copy: segment?.enables_copy || false,
    enables_questions: segment?.enables_questions || false,
  });
  const [saving, setSaving] = useState(false);

  const segmentSuggestions = ["intro", "outro", "practice", "copy", "instructions", "notes", "test"];

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const startSeconds = parseTimeToSeconds(formData.start_time);
      const endSeconds = parseTimeToSeconds(formData.end_time);

      await onSave({
        name: formData.name,
        start_time: startSeconds,
        end_time: endSeconds,
        enables_copy: formData.enables_copy,
        enables_questions: formData.enables_questions,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="font-mono text-xs text-amber-700 block mb-1">
          SEGMENT NAME
        </label>
        <input
          type="text"
          list="segment-suggestions"
          value={formData.name}
          onChange={(e) => handleChange("name", e.target.value)}
          className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-amber-900 focus:border-amber-500 focus:outline-none"
          required
          placeholder="e.g., intro, test, outro"
        />
        <datalist id="segment-suggestions">
          {segmentSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="font-mono text-xs text-amber-700 block mb-1">
            START TIME (mm:ss or seconds)
          </label>
          <input
            type="text"
            value={formData.start_time}
            onChange={(e) => handleChange("start_time", e.target.value)}
            className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-amber-900 focus:border-amber-500 focus:outline-none"
            required
            placeholder="0:00"
          />
        </div>
        <div>
          <label className="font-mono text-xs text-amber-700 block mb-1">
            END TIME (mm:ss, seconds, or blank for end)
          </label>
          <input
            type="text"
            value={formData.end_time}
            onChange={(e) => handleChange("end_time", e.target.value)}
            className="w-full border-2 border-amber-300 px-3 py-2 font-mono text-amber-900 focus:border-amber-500 focus:outline-none"
            placeholder="Leave blank for until end"
          />
        </div>
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enables_copy}
            onChange={(e) => handleChange("enables_copy", e.target.checked)}
            className="w-4 h-4 accent-amber-700"
          />
          <span className="font-mono text-sm text-amber-800">Enables Copy</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enables_questions}
            onChange={(e) => handleChange("enables_questions", e.target.checked)}
            className="w-4 h-4 accent-amber-700"
          />
          <span className="font-mono text-sm text-amber-800">Enables Questions</span>
        </label>
      </div>

      <div className="flex gap-4 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-3 font-mono text-sm tracking-widest border-2 border-amber-300 text-amber-800 hover:border-amber-500 hover:bg-amber-100 transition-all"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 px-4 py-3 font-mono text-sm tracking-widest bg-amber-700 text-amber-50 hover:bg-amber-800 transition-all disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

// Segment Editor Component for managing test segments
export function SegmentEditor({ testId, segments: initialSegments, onClose, onSave }) {
  const { adminFetch } = useAdminAuth();
  const [segments, setSegments] = useState(initialSegments || []);
  const [editingIndex, setEditingIndex] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Calculate total duration for timeline preview
  const maxEndTime = segments.reduce((max, seg) => {
    const end = seg.end_time != null ? seg.end_time : max;
    return Math.max(max, seg.start_time || 0, end);
  }, 0) || 600; // Default to 10 minutes if no segments

  const handleSaveSegment = (segmentData) => {
    if (editingIndex !== null) {
      // Editing existing segment
      const updated = [...segments];
      updated[editingIndex] = segmentData;
      setSegments(updated);
      setEditingIndex(null);
    } else {
      // Adding new segment
      setSegments([...segments, segmentData]);
      setIsAdding(false);
    }
  };

  const handleDeleteSegment = (index) => {
    if (!confirm("Are you sure you want to delete this segment?")) return;
    setSegments(segments.filter((_, i) => i !== index));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await adminFetch(
        `${API_BASE}/api/admin/tests/${testId}`,
        {
          method: "PUT",
          body: JSON.stringify({ segments }),
        }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to save segments");
      }
      if (onSave) onSave(segments);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-amber-50 border-4 border-amber-800 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Corner ornaments */}
        <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-amber-600" />
        <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-amber-600" />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-amber-600" />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-amber-600" />

        {/* Header */}
        <div className="bg-amber-900 text-amber-50 px-6 py-4 flex items-center justify-between">
          <h2 className="font-mono text-sm tracking-widest">
            SEGMENT EDITOR
          </h2>
          <button
            onClick={onClose}
            className="text-amber-50 hover:text-amber-200 font-mono text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-50 border-2 border-red-300 p-4 mb-4">
              <p className="text-red-800 font-mono text-sm">{error}</p>
            </div>
          )}

          {/* Timeline Preview */}
          {segments.length > 0 && !isAdding && editingIndex === null && (
            <div className="mb-6">
              <label className="font-mono text-xs text-amber-700 block mb-2">
                TIMELINE PREVIEW
              </label>
              <div className="h-8 bg-gray-200 rounded relative overflow-hidden">
                {segments
                  .slice()
                  .sort((a, b) => (a.start_time || 0) - (b.start_time || 0))
                  .map((seg, i) => {
                    const start = seg.start_time || 0;
                    const end = seg.end_time != null ? seg.end_time : maxEndTime;
                    const leftPercent = (start / maxEndTime) * 100;
                    const widthPercent = ((end - start) / maxEndTime) * 100;
                    return (
                      <div
                        key={i}
                        className={`absolute top-0 h-full ${getSegmentColor(seg.name)} opacity-80 flex items-center justify-center`}
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                        }}
                        title={`${seg.name}: ${formatSecondsToTime(start)} - ${seg.end_time != null ? formatSecondsToTime(end) : "end"}`}
                      >
                        <span className="text-white text-xs font-mono truncate px-1">
                          {seg.name}
                        </span>
                      </div>
                    );
                  })}
              </div>
              <div className="flex justify-between mt-1">
                <span className="font-mono text-xs text-amber-600">0:00</span>
                <span className="font-mono text-xs text-amber-600">
                  {formatSecondsToTime(maxEndTime)}
                </span>
              </div>
            </div>
          )}

          {isAdding ? (
            <div>
              <h3 className="font-serif text-xl font-bold text-amber-900 mb-4">
                Add New Segment
              </h3>
              <SegmentForm
                segment={null}
                onSave={handleSaveSegment}
                onCancel={() => setIsAdding(false)}
              />
            </div>
          ) : editingIndex !== null ? (
            <div>
              <h3 className="font-serif text-xl font-bold text-amber-900 mb-4">
                Edit Segment: {segments[editingIndex]?.name}
              </h3>
              <SegmentForm
                segment={segments[editingIndex]}
                onSave={handleSaveSegment}
                onCancel={() => setEditingIndex(null)}
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-xl font-bold text-amber-900">
                  Segments ({segments.length})
                </h3>
                <button
                  onClick={() => setIsAdding(true)}
                  className="px-4 py-2 font-mono text-sm tracking-widest bg-amber-700 text-amber-50 hover:bg-amber-800 transition-all"
                >
                  Add Segment
                </button>
              </div>

              {segments.length === 0 ? (
                <div className="text-center py-8">
                  <p className="font-serif text-amber-800 italic">
                    No segments yet. Click "Add Segment" to create one.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {segments
                    .map((seg, originalIndex) => ({ seg, originalIndex }))
                    .sort((a, b) => (a.seg.start_time || 0) - (b.seg.start_time || 0))
                    .map(({ seg, originalIndex }) => (
                      <div
                        key={originalIndex}
                        className="bg-white border-2 border-amber-300 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`font-mono text-xs text-white px-2 py-0.5 ${getSegmentColor(seg.name)}`}>
                                {seg.name}
                              </span>
                              <span className="font-mono text-xs text-amber-600">
                                {formatSecondsToTime(seg.start_time || 0)} - {seg.end_time != null ? formatSecondsToTime(seg.end_time) : "end"}
                              </span>
                            </div>
                            <div className="flex gap-4 text-xs font-mono text-amber-700">
                              {seg.enables_copy && <span>Copy: ON</span>}
                              {seg.enables_questions && <span>Questions: ON</span>}
                              {!seg.enables_copy && !seg.enables_questions && <span className="text-gray-400">No features enabled</span>}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => setEditingIndex(originalIndex)}
                              className="px-3 py-1 font-mono text-xs border-2 border-amber-300 text-amber-800 hover:border-amber-500 hover:bg-amber-100 transition-all"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteSegment(originalIndex)}
                              className="px-3 py-1 font-mono text-xs border-2 border-red-300 text-red-800 hover:border-red-500 hover:bg-red-100 transition-all"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* Save All button */}
              <div className="mt-6 pt-4 border-t-2 border-amber-200">
                <button
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="w-full px-4 py-3 font-mono text-sm tracking-widest bg-amber-900 text-amber-50 hover:bg-amber-800 transition-all disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save All Changes"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Test Manager Component for managing tests
export function TestManager() {
  const { adminFetch } = useAdminAuth();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingQuestions, setEditingQuestions] = useState(null);
  const [editingSegments, setEditingSegments] = useState(null);
  const [toggling, setToggling] = useState(null);

  const fetchTests = useCallback(async () => {
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/tests`);
      if (!response.ok) throw new Error("Failed to fetch tests");
      const data = await response.json();
      setTests(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    fetchTests();
  }, [fetchTests]);

  const handleToggleActive = async (test) => {
    setToggling(test.id);
    try {
      const response = await adminFetch(
        `${API_BASE}/api/admin/tests/${test.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ active: !test.active }),
        }
      );
      if (!response.ok) throw new Error("Failed to update test");
      await fetchTests();
    } catch (err) {
      setError(err.message);
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="font-mono text-amber-600">Loading tests...</div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="bg-red-50 border-2 border-red-300 p-4 mb-4">
          <p className="text-red-800 font-mono text-sm">{error}</p>
        </div>
      )}

      <div className="bg-white border-2 border-amber-300 p-6">
        <h3 className="font-serif text-xl font-bold text-amber-900 mb-4">
          Tests ({tests.length})
        </h3>

        {tests.length === 0 ? (
          <div className="text-center py-8">
            <p className="font-serif text-amber-800 italic">
              No tests found.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tests.map((test) => (
              <div
                key={test.id}
                className={`p-4 border flex justify-between items-center ${
                  test.active
                    ? "border-amber-500 bg-white"
                    : "border-gray-300 bg-gray-100"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono text-xs bg-amber-200 text-amber-800 px-2 py-0.5">
                      ID: {test.id}
                    </span>
                    <span className="font-mono text-xs text-amber-600">
                      {test.speed_wpm} WPM
                    </span>
                    {test.year && (
                      <span className="font-mono text-xs text-amber-600">
                        {test.year}
                      </span>
                    )}
                    <span className={`font-mono text-xs px-2 py-0.5 ${
                      test.active
                        ? "bg-green-200 text-green-800"
                        : "bg-gray-200 text-gray-600"
                    }`}>
                      {test.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="font-serif text-amber-900">
                    {test.title || "Untitled Test"}
                  </p>
                  <p className="font-mono text-xs text-amber-600 mt-1">
                    {test.question_count || 0} question{(test.question_count || 0) !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setEditingQuestions(test.id)}
                    className="px-3 py-1 font-mono text-xs border-2 border-amber-300 text-amber-800 hover:border-amber-500 hover:bg-amber-100 transition-all"
                  >
                    Questions
                  </button>
                  <button
                    onClick={() => setEditingSegments({ testId: test.id, segments: test.segments || [] })}
                    className="px-3 py-1 font-mono text-xs border-2 border-amber-300 text-amber-800 hover:border-amber-500 hover:bg-amber-100 transition-all"
                  >
                    Segments
                  </button>
                  <button
                    onClick={() => handleToggleActive(test)}
                    disabled={toggling === test.id}
                    className={`px-3 py-1 font-mono text-xs border-2 transition-all ${
                      toggling === test.id
                        ? "border-gray-300 text-gray-400 cursor-not-allowed"
                        : test.active
                        ? "border-red-300 text-red-800 hover:border-red-500 hover:bg-red-100"
                        : "border-green-300 text-green-800 hover:border-green-500 hover:bg-green-100"
                    }`}
                  >
                    {toggling === test.id ? "..." : test.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingQuestions && (
        <QuestionEditor
          testId={editingQuestions}
          onClose={() => setEditingQuestions(null)}
        />
      )}

      {editingSegments && (
        <SegmentEditor
          testId={editingSegments.testId}
          segments={editingSegments.segments}
          onClose={() => setEditingSegments(null)}
          onSave={() => fetchTests()}
        />
      )}
    </div>
  );
}

// Question Editor Component for managing test questions
export function QuestionEditor({ testId, onClose }) {
  const { adminFetch } = useAdminAuth();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [isAdding, setIsAdding] = useState(false);

  const fetchQuestions = async () => {
    try {
      const response = await adminFetch(
        `${API_BASE}/api/admin/tests/${testId}/questions`
      );
      if (!response.ok) throw new Error("Failed to fetch questions");
      const data = await response.json();
      setQuestions(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, [testId]);

  const handleSaveNew = async (questionData) => {
    try {
      const response = await adminFetch(
        `${API_BASE}/api/admin/tests/${testId}/questions`,
        {
          method: "POST",
          body: JSON.stringify(questionData),
        }
      );
      if (!response.ok) throw new Error("Failed to create question");
      setIsAdding(false);
      await fetchQuestions();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveEdit = async (questionData) => {
    try {
      const response = await adminFetch(
        `${API_BASE}/api/admin/questions/${editingQuestion.id}`,
        {
          method: "PUT",
          body: JSON.stringify(questionData),
        }
      );
      if (!response.ok) throw new Error("Failed to update question");
      setEditingQuestion(null);
      await fetchQuestions();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (questionId) => {
    if (!confirm("Are you sure you want to delete this question?")) return;
    try {
      const response = await adminFetch(
        `${API_BASE}/api/admin/questions/${questionId}`,
        {
          method: "DELETE",
        }
      );
      if (!response.ok) throw new Error("Failed to delete question");
      await fetchQuestions();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-amber-50 border-4 border-amber-800 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Corner ornaments */}
        <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-amber-600" />
        <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-amber-600" />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-amber-600" />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-amber-600" />

        {/* Header */}
        <div className="bg-amber-900 text-amber-50 px-6 py-4 flex items-center justify-between">
          <h2 className="font-mono text-sm tracking-widest">
            QUESTION EDITOR
          </h2>
          <button
            onClick={onClose}
            className="text-amber-50 hover:text-amber-200 font-mono text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-50 border-2 border-red-300 p-4 mb-4">
              <p className="text-red-800 font-mono text-sm">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="font-mono text-amber-600">Loading...</div>
            </div>
          ) : isAdding ? (
            <div>
              <h3 className="font-serif text-xl font-bold text-amber-900 mb-4">
                Add New Question
              </h3>
              <QuestionForm
                question={null}
                onSave={handleSaveNew}
                onCancel={() => setIsAdding(false)}
              />
            </div>
          ) : editingQuestion ? (
            <div>
              <h3 className="font-serif text-xl font-bold text-amber-900 mb-4">
                Edit Question #{editingQuestion.question_number}
              </h3>
              <QuestionForm
                question={editingQuestion}
                onSave={handleSaveEdit}
                onCancel={() => setEditingQuestion(null)}
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-xl font-bold text-amber-900">
                  Questions ({questions.length})
                </h3>
                <button
                  onClick={() => setIsAdding(true)}
                  className="px-4 py-2 font-mono text-sm tracking-widest bg-amber-700 text-amber-50 hover:bg-amber-800 transition-all"
                >
                  Add Question
                </button>
              </div>

              {questions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="font-serif text-amber-800 italic">
                    No questions yet. Click "Add Question" to create one.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {questions
                    .sort((a, b) => a.question_number - b.question_number)
                    .map((q) => (
                      <div
                        key={q.id}
                        className="bg-white border-2 border-amber-300 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-mono text-xs bg-amber-200 text-amber-800 px-2 py-0.5">
                                Q{q.question_number}
                              </span>
                              <span className="font-mono text-xs text-amber-600">
                                Answer: {q.correct_option}
                              </span>
                            </div>
                            <p className="font-serif text-amber-900 text-sm truncate">
                              {q.question_text}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => setEditingQuestion(q)}
                              className="px-3 py-1 font-mono text-xs border-2 border-amber-300 text-amber-800 hover:border-amber-500 hover:bg-amber-100 transition-all"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(q.id)}
                              className="px-3 py-1 font-mono text-xs border-2 border-red-300 text-red-800 hover:border-red-500 hover:bg-red-100 transition-all"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

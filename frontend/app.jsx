import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { API_BASE, morsePatterns, getSegmentColor, VintagePattern, TelegraphKey } from "./shared.jsx";

// Confirmation Modal component (local version with different styling than shared)
const ConfirmModal = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Yes",
  cancelText = "Cancel",
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* Modal */}
      <div className="relative bg-amber-50 border-4 border-amber-800 shadow-2xl max-w-md w-full p-8">
        {/* Corner ornaments */}
        <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-amber-600" />
        <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-amber-600" />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-amber-600" />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-amber-600" />

        <h2
          className="font-serif text-2xl font-bold text-amber-900 mb-4 text-center"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          {title}
        </h2>

        <p className="font-serif text-amber-800 text-center mb-8 whitespace-pre-line">
          {message}
        </p>

        <div className="flex gap-4 justify-center">
          <button
            onClick={onCancel}
            className="px-6 py-3 font-mono text-sm tracking-widest border-2 border-amber-300 text-amber-800 hover:border-amber-500 hover:bg-amber-100 transition-all"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-3 font-mono text-sm tracking-widest bg-amber-900 text-amber-50 hover:bg-amber-800 transition-all"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// Main App Component
export function App() {
  const [view, setView] = useState("home"); // home, select, test, results, certificate, leaderboard
  const [selectedTest, setSelectedTest] = useState(null);
  const [answers, setAnswers] = useState({});
  const [copyText, setCopyText] = useState("");
  const [testComplete, setTestComplete] = useState(false);
  const [score, setScore] = useState(null);
  const [passed, setPassed] = useState(false);
  const [userCall, setUserCall] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [certificateNumber, setCertificateNumber] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [roster, setRoster] = useState([]);
  const [stats, setStats] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState(null);
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [passReason, setPassReason] = useState(null);
  const [modal, setModal] = useState({
    isOpen: false,
    type: null,
    testKey: null,
  });
  const audioRef = useRef(null);

  const [tests, setTests] = useState([]);
  const [currentTest, setCurrentTest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [correctAnswers, setCorrectAnswers] = useState(null);
  const [loadingTest, setLoadingTest] = useState(false);

  // Fetch available tests on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/tests`)
      .then(res => res.json())
      .then(data => setTests(data))
      .catch(err => console.error('Failed to fetch tests:', err));
  }, []);

  // Fetch leaderboard data
  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/leaderboard?limit=20`);
      if (response.ok) {
        const data = await response.json();
        setLeaderboard(data);
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  // Fetch roster
  const fetchRoster = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/roster`);
      if (response.ok) {
        const data = await response.json();
        setRoster(data);
      }
    } catch (error) {
      console.error("Failed to fetch roster:", error);
    }
  };

  // Submit attempt to API
  const submitAttempt = async (attemptData) => {
    try {
      const response = await fetch(`${API_BASE}/api/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attemptData),
      });
      if (response.ok) {
        const data = await response.json();
        return { success: true, data };
      } else if (response.status === 400) {
        const text = await response.text();
        return { success: false, blocked: true, message: text };
      }
    } catch (error) {
      console.error("Failed to submit attempt:", error);
    }
    return { success: false };
  };

  const startTest = async (testId) => {
    setLoadingTest(true);
    try {
      const test = tests.find(t => t.id === testId);
      setCurrentTest(test);

      const res = await fetch(`${API_BASE}/api/tests/${testId}/questions`);
      const qs = await res.json();
      setQuestions(qs);
      setSelectedTest(testId);
      setAnswers({});
      setCorrectAnswers(null);
      setCopyText("");
      setTestComplete(false);
      setScore(null);
      setPassed(false);
      setAudioPlayed(false);
      setAudioProgress(0);
      setAudioCurrentTime(0);
      setView('test');
    } catch (err) {
      console.error('Failed to fetch questions:', err);
      alert('Failed to load test questions');
    } finally {
      setLoadingTest(false);
    }
  };

  const handleAnswer = (questionId, option) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option })); // option is "A", "B", "C", or "D"
  };

  // Show abandon confirmation modal
  const handleAbandon = () => {
    setModal({ isOpen: true, type: "abandon", testKey: null });
  };

  // Actually abandon the test
  const confirmAbandon = async () => {
    setModal({ isOpen: false, type: null, testKey: null });
    if (currentTest) {
      // Log a failed attempt
      await submitAttempt({
        callsign: userCall,
        test_speed: currentTest.speed_wpm,
        questions_correct: 0,
        copy_chars: 0,
        passed: false,
        audio_progress: audioProgress,
      });
      setView("select");
    }
  };

  // Show start test confirmation modal
  const handleStartClick = (testKey) => {
    if (!userCall.trim()) {
      alert("Please enter your callsign");
      return;
    }
    setModal({ isOpen: true, type: "start", testKey });
  };

  // Actually start the test
  const confirmStartTest = () => {
    const testId = modal.testKey;
    setModal({ isOpen: false, type: null, testKey: null });
    startTest(testId);
  };

  // Close modal without action
  const closeModal = () => {
    setModal({ isOpen: false, type: null, testKey: null });
  };

  const handleSubmit = async () => {
    if (!userCall.trim()) {
      alert('Please enter your callsign');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/tests/${selectedTest}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callsign: userCall.trim().toUpperCase(),
          answers: answers, // { questionId: "A", ... }
          copy_text: copyText || null,
          audio_progress: audioProgress,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        if (res.status === 400) {
          setBlockedMessage(error);
          setView("blocked");
          return;
        }
        throw new Error(error);
      }

      const result = await res.json();
      setScore({
        correct: result.score,
        total: questions.length,
        copyChars: copyText.replace(/\s/g, "").length,
        consecutiveCorrect: result.consecutive_correct || 0,
      });
      setConsecutiveCorrect(result.consecutive_correct || 0);
      setPassReason(result.pass_reason);
      setPassed(result.passed);
      setTestComplete(true);

      if (result.passed && result.correct_answers) {
        setCorrectAnswers(result.correct_answers);
      }
      if (result.certificate_id) {
        setCertificateNumber(result.certificate_id);
      }

      setView('results');
    } catch (err) {
      console.error('Submit failed:', err);
      alert('Failed to submit test: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = () => {
    return new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Format seconds as MM:SS
  const formatTime = (seconds) => {
    if (!seconds || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Get segments for current test, with fallback
  const activeSegments = useMemo(() => {
    if (currentTest?.segments?.length > 0) {
      return currentTest.segments.map(seg => ({
        name: seg.name,
        start: seg.start_time,
        end: seg.end_time ?? Infinity,
        color: getSegmentColor(seg.name),
        enablesCopy: seg.enables_copy,
        enablesQuestions: seg.enables_questions,
      }));
    }
    // Fallback: single segment covering entire audio
    return [{
      name: 'Test',
      start: 0,
      end: Infinity,
      color: 'bg-green-600',
      enablesCopy: true,
      enablesQuestions: true,
    }];
  }, [currentTest]);

  // Get current audio segment based on playback time
  const getCurrentSegment = (currentTime) => {
    return (
      activeSegments.find(
        (seg) => currentTime >= seg.start && currentTime < seg.end,
      ) || activeSegments[0]
    );
  };

  // Computed values for conditional UI display
  const currentSegment = getCurrentSegment(audioCurrentTime);
  const showCopySection = currentSegment?.enablesCopy || false;
  const showQuestionsSection = currentSegment?.enablesQuestions || false;
  const examComplete = audioPlayed; // After audio finishes, show everything

  // Home Page
  if (view === "home") {
    return (
      <div className="min-h-screen bg-amber-50 text-stone-800 relative overflow-hidden">
        <VintagePattern />

        {/* Decorative morse border */}
        <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-amber-900/10 to-transparent flex items-center justify-center overflow-hidden">
          <div className="text-amber-900/20 font-mono text-xs tracking-[0.5em] whitespace-nowrap animate-pulse">
            {morsePatterns.BT}
          </div>
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 py-16">
          {/* Main content card with solid background */}
          <div className="bg-amber-50/95 backdrop-blur-sm shadow-2xl shadow-amber-900/10 border border-amber-200/50 px-8 py-12 md:px-12">
            {/* Logo/Header */}
            <header className="text-center mb-16">
              <div className="inline-block mb-6">
                <TelegraphKey className="w-24 h-12 text-amber-800 mx-auto mb-4 drop-shadow-md" />
              </div>
              <h1
                className="font-serif text-6xl md:text-7xl font-bold tracking-tight text-amber-900 mb-2 drop-shadow-sm"
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  textShadow: "2px 2px 4px rgba(120, 53, 15, 0.15)",
                }}
              >
                KNOW CODE
              </h1>
              <h2
                className="font-serif text-4xl md:text-5xl font-light tracking-widest text-amber-700 mb-6"
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  textShadow: "1px 1px 3px rgba(120, 53, 15, 0.1)",
                }}
              >
                EXTRA
              </h2>
              <div className="flex items-center justify-center gap-4 text-amber-800/70 mb-8">
                <span className="h-px w-16 bg-amber-800/40" />
                <span className="font-mono text-sm tracking-widest font-medium">
                  EST. 1991
                </span>
                <span className="h-px w-16 bg-amber-800/40" />
              </div>
              <p
                className="font-serif text-xl text-amber-800 max-w-2xl mx-auto leading-relaxed italic"
                style={{ textShadow: "0 1px 2px rgba(255, 251, 235, 0.8)" }}
              >
                Take the historic FCC Morse Code examinations and prove your
                proficiency with an authentic certificate
              </p>
            </header>

            {/* Decorative divider */}
            <div className="flex items-center justify-center my-12">
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-amber-700" />
                <div className="w-2 h-2 rounded-full bg-amber-700" />
                <div className="w-2 h-2 rounded-full bg-amber-700" />
                <div className="w-2 h-2 rounded-full bg-amber-700" />
                <div className="w-4 h-1 bg-amber-700" />
              </div>
            </div>

            {/* Info cards */}
            <div className="grid md:grid-cols-3 gap-6 mb-12">
              {[
                {
                  title: "AUTHENTIC TESTS",
                  desc: "Original FCC examination audio from the ARRL archives, digitized for preservation",
                },
                {
                  title: "HISTORIC STANDARD",
                  desc: "Pass by copying 100 characters solid OR answering 7 of 10 questions correctly",
                },
                {
                  title: "CERTIFICATES",
                  desc: "Receive a commemorative certificate honoring the tradition of CW proficiency",
                },
              ].map((card, i) => (
                <div
                  key={i}
                  className="bg-white border-2 border-amber-300 p-6 text-center
                                      hover:border-amber-500 hover:bg-amber-50 transition-all duration-300
                                      shadow-lg hover:shadow-xl"
                >
                  <h3 className="font-mono text-sm tracking-widest text-amber-900 mb-3 font-bold">
                    {card.title}
                  </h3>
                  <p className="font-serif text-amber-800 text-sm leading-relaxed">
                    {card.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <div className="text-center space-y-4">
              <button
                onClick={() => setView("select")}
                className="group relative inline-flex items-center gap-3 bg-amber-900 text-amber-50
                         px-12 py-5 font-mono text-lg tracking-widest
                         hover:bg-amber-800 transition-all duration-300
                         shadow-[4px_4px_0_0_rgba(120,53,15,0.4)]
                         hover:shadow-[6px_6px_0_0_rgba(120,53,15,0.5)]
                         hover:translate-x-[-2px] hover:translate-y-[-2px]"
              >
                <span>BEGIN EXAMINATION</span>
                <span className="text-amber-400 group-hover:translate-x-1 transition-transform">
                  {"\u2192"}
                </span>
              </button>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => {
                    fetchLeaderboard();
                    fetchStats();
                    setView("leaderboard");
                  }}
                  className="font-mono text-sm text-amber-700 hover:text-amber-900 underline underline-offset-4"
                >
                  VIEW LEADERBOARD
                </button>
                <button
                  onClick={() => {
                    fetchRoster();
                    setView("roster");
                  }}
                  className="font-mono text-sm text-amber-700 hover:text-amber-900 underline underline-offset-4"
                >
                  VIEW ROSTER
                </button>
              </div>
            </div>

            {/* Footer note */}
            <footer className="mt-16 text-center">
              <p className="font-mono text-xs text-amber-700 tracking-wide font-medium">
                TEST MATERIALS COURTESY OF WB4WXD & KB6NU • NOT FOR OFFICIAL FCC
                USE
              </p>
              <p className="font-mono text-xs text-amber-600/60 mt-2">
                {morsePatterns.SK}
              </p>
              <p className="font-mono text-xs text-amber-600 mt-4">
                CONTACT: jaysvana@gmail.com / W6JSV
              </p>
            </footer>
          </div>{" "}
          {/* End main content card */}
        </div>
      </div>
    );
  }

  // Test Selection Page
  if (view === "select") {
    return (
      <div className="min-h-screen bg-amber-50 text-stone-800 relative">
        <VintagePattern />

        <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
          {/* Main content card */}
          <div className="bg-amber-50/95 backdrop-blur-sm shadow-2xl shadow-amber-900/10 border border-amber-200/50 px-8 py-10 md:px-12">
            <button
              onClick={() => setView("home")}
              className="font-mono text-sm text-amber-700 hover:text-amber-900 mb-8 flex items-center gap-2 font-medium"
            >
              {"\u2190"} RETURN HOME
            </button>

            <h1
              className="font-serif text-4xl font-bold text-amber-900 mb-2 text-center drop-shadow-sm"
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                textShadow: "1px 1px 3px rgba(120, 53, 15, 0.1)",
              }}
            >
              Select Your Examination
            </h1>
            <p className="text-center text-amber-700 mb-12 font-serif italic">
              Choose the code speed for your proficiency test
            </p>

            {/* User Info */}
            <div className="bg-white border-2 border-amber-300 p-6 mb-8 max-w-md mx-auto shadow-md">
              <h3 className="font-mono text-sm tracking-widest text-amber-900 mb-4 text-center font-bold">
                APPLICANT INFORMATION
              </h3>
              <div>
                <label className="font-mono text-xs text-amber-700 block mb-1 font-medium">
                  CALLSIGN
                </label>
                <input
                  type="text"
                  value={userCall}
                  onChange={(e) => setUserCall(e.target.value.toUpperCase())}
                  className="w-full border-2 border-amber-300 bg-white px-4 py-3 font-mono uppercase text-lg tracking-wider
                         focus:border-amber-500 focus:outline-none transition-colors text-center"
                  placeholder="W6JSV"
                  maxLength={10}
                />
                <p className="font-serif text-xs text-amber-600 mt-2 text-center italic">
                  Your callsign will be recorded with your test results
                </p>
              </div>
            </div>

            {/* Test Cards */}
            <div className="grid md:grid-cols-3 gap-6">
              {tests.map((test) => (
                <button
                  key={test.id}
                  onClick={() => handleStartClick(test.id)}
                  disabled={!userCall.trim() || loadingTest}
                  className={`group bg-white border-2 border-amber-300 p-8 text-left
                           transition-all duration-300 relative overflow-hidden shadow-md
                           ${
                             userCall.trim() && !loadingTest
                               ? "hover:border-amber-500 hover:bg-amber-50 hover:shadow-xl cursor-pointer"
                               : "opacity-50 cursor-not-allowed"
                           }`}
                >
                  <div
                    className="absolute top-0 right-0 w-24 h-24 -mr-12 -mt-12 bg-amber-100
                               rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500"
                  />

                  <div className="relative">
                    <span className="font-mono text-xs tracking-widest text-amber-600 block mb-2 font-medium">
                      {test.year} EXAMINATION
                    </span>
                    <h3 className="font-serif text-3xl font-bold text-amber-900 mb-1">
                      {test.speed_wpm} WPM
                    </h3>
                    <p className="font-serif text-amber-700 mb-4">
                      {test.title}
                    </p>

                    <div
                      className="flex items-center gap-2 text-amber-600 font-mono text-sm font-medium
                                group-hover:text-amber-800 transition-colors"
                    >
                      <span>Start Test</span>
                      <span className="group-hover:translate-x-1 transition-transform">
                        {"\u2192"}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Rate limit note */}
            <div className="mt-8 p-4 bg-red-50 border-2 border-red-200 shadow-sm">
              <p className="font-mono text-red-800 text-sm text-center font-medium">
                You may only attempt this examination once per day
              </p>
            </div>

            {/* Historical note */}
            <div className="mt-4 p-6 bg-amber-100 border-l-4 border-amber-600 shadow-sm">
              <p className="font-serif text-amber-800 text-sm leading-relaxed">
                <strong>Historical Note:</strong> From 1936 until 2007, the FCC
                required amateur radio operators to demonstrate Morse code
                proficiency. The 20 WPM test was required for the Amateur Extra
                class license.
              </p>
            </div>
          </div>{" "}
          {/* End main content card */}
          {/* Start confirmation modal */}
          <ConfirmModal
            isOpen={modal.isOpen && modal.type === "start"}
            title="Begin Examination"
            message={
              "Are you sure you want to start the test?\n\nYou may only attempt this examination once per day. Once you begin, abandoning the test will count as a failed attempt."
            }
            confirmText="Start Test"
            cancelText="Go Back"
            onConfirm={confirmStartTest}
            onCancel={closeModal}
          />
        </div>
      </div>
    );
  }

  // Test Page
  if (view === "test") {
    return (
      <div className="min-h-screen bg-amber-50 text-stone-800 relative">
        <VintagePattern />

        <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
          {/* Main content card */}
          <div className="bg-amber-50/95 backdrop-blur-sm shadow-2xl shadow-amber-900/10 border border-amber-200/50 px-6 py-8 md:px-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <button
                onClick={handleAbandon}
                className="font-mono text-sm text-amber-700 hover:text-amber-900 flex items-center gap-2 font-medium"
              >
  {"\u2190"} ABANDON TEST
              </button>
              <div className="text-right">
                <span className="font-mono text-sm text-amber-600 block font-medium">
                  {currentTest.title}
                </span>
                <span className="font-serif text-2xl font-bold text-amber-900">
                  {currentTest.speed_wpm} WPM
                </span>
              </div>
            </div>

            {/* User guidance notice */}
            {!audioPlayed && !isPlaying && (
              <div className="mb-4 p-3 border-2 border-amber-300 bg-amber-100 text-amber-800 font-mono text-sm">
                Sections will appear as the recording progresses. Copy practice appears during practice segments.
                Questions appear during the test segment. You'll see everything together at the end.
              </div>
            )}

            {/* Audio Player Section */}
            <div
              className="bg-gradient-to-br from-amber-900 to-amber-800 text-amber-50 p-8 mb-8
                         shadow-xl border-4 border-amber-700"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-mono text-sm tracking-widest">
                  CODE TRANSMISSION
                </h2>
                <TelegraphKey className="w-16 h-8 text-amber-300" />
              </div>

              <audio
                ref={audioRef}
                src={currentTest.audio_url}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => {
                  setIsPlaying(false);
                  setAudioPlayed(true);
                }}
                onLoadedMetadata={(e) => {
                  setAudioDuration(e.target.duration);
                }}
                onTimeUpdate={(e) => {
                  const audio = e.target;
                  setAudioCurrentTime(audio.currentTime);
                  setAudioProgress(
                    (audio.currentTime / audio.duration) * 100 || 0,
                  );
                }}
              />

              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    if (audioRef.current && !audioPlayed) {
                      if (isPlaying) {
                        audioRef.current.pause();
                      } else {
                        audioRef.current.play();
                      }
                    }
                  }}
                  disabled={audioPlayed}
                  className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg text-2xl font-bold transition-colors
                          ${
                            audioPlayed
                              ? "bg-amber-800 text-amber-500 cursor-not-allowed"
                              : "bg-amber-100 text-amber-900 hover:bg-white"
                          }`}
                >
                  {audioPlayed ? "\u2713" : isPlaying ? "\u275A\u275A" : "\u25B6"}
                </button>

                <div className="flex-1">
                  {/* Segment timeline */}
                  <div className="flex h-3 rounded-full overflow-hidden mb-1">
                    {activeSegments.map((seg, i) => {
                      const totalDuration = audioDuration || 531; // fallback to expected duration
                      const segEnd =
                        seg.end === Infinity ? totalDuration : seg.end;
                      const segDuration = segEnd - seg.start;
                      const widthPercent = (segDuration / totalDuration) * 100;
                      const currentSeg = getCurrentSegment(audioCurrentTime);
                      const isCurrentSegment = currentSeg.name === seg.name;
                      const isPastSegment = audioCurrentTime >= segEnd;

                      return (
                        <div
                          key={seg.name}
                          className={`relative ${seg.color} ${isCurrentSegment ? "opacity-100" : isPastSegment ? "opacity-70" : "opacity-40"} transition-opacity duration-300`}
                          style={{ width: `${widthPercent}%` }}
                          title={`${seg.name}: ${formatTime(seg.start)} - ${formatTime(segEnd)}`}
                        >
                          {isCurrentSegment && (
                            <div
                              className="absolute top-0 left-0 h-full bg-white/30"
                              style={{
                                width: `${((audioCurrentTime - seg.start) / segDuration) * 100}%`,
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Segment labels */}
                  <div className="flex mb-2">
                    {activeSegments.map((seg) => {
                      const totalDuration = audioDuration || 531;
                      const segEnd =
                        seg.end === Infinity ? totalDuration : seg.end;
                      const segDuration = segEnd - seg.start;
                      const widthPercent = (segDuration / totalDuration) * 100;
                      const currentSeg = getCurrentSegment(audioCurrentTime);
                      const isCurrentSegment = currentSeg.name === seg.name;

                      return (
                        <div
                          key={seg.name}
                          className={`font-mono text-[10px] text-center truncate transition-all duration-300 ${isCurrentSegment ? "text-amber-100 font-bold" : "text-amber-400"}`}
                          style={{ width: `${widthPercent}%` }}
                        >
                          {seg.name}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-between items-center">
                    <p className="font-mono text-xs text-amber-300">
                      {audioPlayed
                        ? "TRANSMISSION COMPLETE"
                        : isPlaying
                          ? "TRANSMITTING..."
                          : "READY TO TRANSMIT"}
                    </p>
                    <p className="font-mono text-xs text-amber-300">
                      {formatTime(audioCurrentTime)} /{" "}
                      {formatTime(audioDuration)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Copy Area */}
            {(showCopySection || examComplete) && (
              <div className="bg-white border-2 border-amber-300 p-6 mb-8 shadow-md">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-mono text-sm tracking-widest text-amber-900 font-bold">
                    YOUR COPY
                  </h3>
                  <span className="font-mono text-sm text-amber-700 font-medium">
                    {copyText.replace(/\s/g, "").length} / 100 characters
                  </span>
                </div>
                <textarea
                  value={copyText}
                  onChange={(e) => setCopyText(e.target.value)}
                  className="w-full h-40 border-2 border-amber-300 bg-amber-50 p-4 font-mono text-lg
                          focus:border-amber-500 focus:outline-none resize-none"
                  placeholder="Copy the transmission here..."
                />
                <div className="mt-2 space-y-1">
                  <p className="font-serif text-xs text-amber-700 italic">
                    Copy 100 consecutive correct characters to pass, OR answer 7 of 10 questions correctly.
                  </p>
                  <p className="font-serif text-xs text-amber-600">
                    <strong>Prosigns:</strong> Enter prosigns in angle brackets, e.g., &lt;BT&gt; for break.
                    Some prosigns can also be entered as their equivalent character (e.g., = for &lt;BT&gt;).
                  </p>
                </div>
              </div>
            )}

            {/* Questions */}
            {(showQuestionsSection || examComplete) && (
              <div className="bg-white border-2 border-amber-300 p-6 mb-8 shadow-md">
                <h3 className="font-mono text-sm tracking-widest text-amber-900 mb-6 font-bold">
                  COMPREHENSION QUESTIONS
                </h3>

                <div className="space-y-6">
                  {questions.map((q) => {
                    const options = [
                      { letter: "A", text: q.option_a },
                      { letter: "B", text: q.option_b },
                      { letter: "C", text: q.option_c },
                      { letter: "D", text: q.option_d },
                    ];
                    const isSelected = (letter) => answers[q.id] === letter;
                    const isCorrect = (letter) => correctAnswers && correctAnswers[q.id] === letter;
                    const showCorrect = testComplete && passed && correctAnswers;

                    return (
                      <div
                        key={q.id}
                        className="border-b border-amber-200 pb-6 last:border-0"
                      >
                        <p className="font-serif text-amber-900 mb-3">
                          <span className="font-mono text-amber-600 mr-2 font-medium">
                            {q.question_number}.
                          </span>
                          {q.question_text}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {options.map((opt) => (
                            <button
                              key={opt.letter}
                              onClick={() => !testComplete && handleAnswer(q.id, opt.letter)}
                              disabled={testComplete}
                              className={`p-3 text-left font-serif text-sm border-2 transition-all
                                       ${
                                         isSelected(opt.letter)
                                           ? "border-amber-600 bg-amber-100 text-amber-900"
                                           : "border-amber-300 bg-amber-50 hover:border-amber-500 text-amber-800"
                                       }
                                       ${showCorrect && isCorrect(opt.letter) ? "ring-2 ring-green-500" : ""}`}
                            >
                              <span className="font-mono text-xs text-amber-600 mr-2 font-medium">
                                {opt.letter}.
                              </span>
                              {opt.text}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Submit - only show when audio is finished and all questions answered */}
            {audioPlayed && Object.keys(answers).length === questions.length && (
              <div className="text-center">
                <button
                  onClick={handleSubmit}
                  className="bg-amber-900 text-amber-50 px-12 py-4 font-mono tracking-widest
                          hover:bg-amber-800 transition-all shadow-lg hover:shadow-xl"
                >
                  SUBMIT EXAMINATION
                </button>
              </div>
            )}
          </div>{" "}
          {/* End main content card */}
          {/* Abandon confirmation modal */}
          <ConfirmModal
            isOpen={modal.isOpen && modal.type === "abandon"}
            title="Abandon Test?"
            message={
              "Are you sure you want to abandon this test?\n\nYou may only attempt the test once per day. If you abandon now, you won't be able to try again until tomorrow."
            }
            confirmText="Abandon Test"
            cancelText="Continue Test"
            onConfirm={confirmAbandon}
            onCancel={closeModal}
          />
        </div>
      </div>
    );
  }

  // Results Page
  if (view === "results") {
    return (
      <div className="min-h-screen bg-amber-50 text-stone-800 relative">
        <VintagePattern />

        <div className="relative z-10 max-w-2xl mx-auto px-6 py-12">
          {/* Main content card */}
          <div className="bg-amber-50/95 backdrop-blur-sm shadow-2xl shadow-amber-900/10 border border-amber-200/50 p-4">
            <div
              className={`text-center p-12 border-4 ${passed ? "border-green-600 bg-green-50" : "border-red-600 bg-red-50"}`}
            >
              <div className="mb-6">
                {passed ? (
                  <div className="w-24 h-24 mx-auto rounded-full bg-green-600 text-white flex items-center justify-center text-5xl shadow-lg">
                    {"\u2713"}
                  </div>
                ) : (
                  <div className="w-24 h-24 mx-auto rounded-full bg-red-600 text-white flex items-center justify-center text-5xl shadow-lg">
                    {"\u2717"}
                  </div>
                )}
              </div>

              <h1
                className="font-serif text-4xl font-bold mb-2"
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  color: passed ? "#166534" : "#dc2626",
                }}
              >
                {passed ? "EXAMINATION PASSED" : "EXAMINATION NOT PASSED"}
              </h1>

              <p className="font-serif text-lg text-amber-800 mb-8">
                {currentTest.speed_wpm} WPM {currentTest.title} Code Test
              </p>

              <div className="grid grid-cols-2 gap-6 mb-8">
                <div className="bg-white p-6 border-2 border-amber-300 shadow-sm">
                  <p className="font-mono text-xs text-amber-600 mb-1 font-medium">
                    QUESTIONS
                  </p>
                  <p className="font-serif text-3xl font-bold text-amber-900">
                    {score.correct} / {score.total}
                  </p>
                  <p className="font-mono text-xs text-amber-600 mt-1 font-medium">
                    {score.correct >= 7 ? "\u2713 PASSED" : "\u2717 Need 7+"}
                  </p>
                </div>
                <div className="bg-white p-6 border-2 border-amber-300 shadow-sm">
                  <p className="font-mono text-xs text-amber-600 mb-1 font-medium">
                    COPY
                  </p>
                  <p className="font-serif text-3xl font-bold text-amber-900">
                    {consecutiveCorrect} correct
                  </p>
                  <p className="font-mono text-xs text-amber-600 mt-1 font-medium">
                    {consecutiveCorrect >= 100 ? "\u2713 PASSED" : "\u2717 Need 100+"}
                  </p>
                </div>
              </div>

              {passed && passReason && (
                <div className="mt-4 mb-4 text-center">
                  <span className="inline-block bg-green-100 border border-green-300 px-4 py-2 font-mono text-sm text-green-800">
                    Passed by: {passReason === 'both' ? 'Questions & Copy' : passReason === 'questions' ? 'Questions' : 'Copy'}
                  </span>
                </div>
              )}

              {passed && (
                <div className="bg-amber-100 border-2 border-amber-400 p-6 mb-6">
                  <h3 className="font-mono text-sm text-amber-800 mb-2 font-bold">
                    VERIFICATION PENDING
                  </h3>
                  <p className="font-serif text-amber-800">
                    Congratulations! Your result has been submitted for
                    verification. Once approved, you'll be able to view and
                    download your official certificate.
                  </p>
                </div>
              )}

              {/* Question Review - only shown when passed with correct answers */}
              {passed && correctAnswers && (
                <div className="bg-white border-2 border-amber-300 p-6 mb-6 text-left">
                  <h3 className="font-mono text-sm text-amber-800 mb-4 font-bold text-center">
                    QUESTION REVIEW
                  </h3>
                  <div className="space-y-4">
                    {questions.map((q) => {
                      const options = [
                        { letter: "A", text: q.option_a },
                        { letter: "B", text: q.option_b },
                        { letter: "C", text: q.option_c },
                        { letter: "D", text: q.option_d },
                      ];
                      return (
                        <div key={q.id} className="border-b border-amber-200 pb-4 last:border-0">
                          <p className="font-serif text-amber-900 mb-2 text-sm">
                            <span className="font-mono text-amber-600 mr-2 font-medium">
                              {q.question_number}.
                            </span>
                            {q.question_text}
                          </p>
                          <div className="grid grid-cols-2 gap-1">
                            {options.map((opt) => {
                              const isSelected = answers[q.id] === opt.letter;
                              const isCorrect = correctAnswers[q.id] === opt.letter;
                              return (
                                <div
                                  key={opt.letter}
                                  className={`p-2 text-xs font-serif border transition-all
                                    ${isSelected ? "border-amber-600 bg-amber-100" : "border-amber-200 bg-amber-50"}
                                    ${isCorrect ? "ring-2 ring-green-500" : ""}`}
                                >
                                  <span className="font-mono text-amber-600 mr-1">
                                    {opt.letter}.
                                  </span>
                                  {opt.text}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-4">
                <button
                  onClick={() => setView("select")}
                  className="bg-white text-amber-900 px-8 py-4 font-mono tracking-widest
                          border-2 border-amber-300 hover:border-amber-500 transition-all"
                >
                  {passed ? "TRY ANOTHER SPEED" : "TRY AGAIN"}
                </button>
              </div>
            </div>
          </div>{" "}
          {/* End main content card */}
        </div>
      </div>
    );
  }

  // Certificate Page
  if (view === "certificate") {
    return (
      <div className="min-h-screen bg-stone-800 py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <button
              onClick={() => setView("select")}
              className="font-mono text-sm text-stone-400 hover:text-stone-200 mb-4"
            >
{"\u2190"} Take Another Test
            </button>
            <p className="font-mono text-xs text-stone-500">
              Right-click or long-press to save your certificate
            </p>
          </div>

          {/* Certificate */}
          <div className="bg-amber-50 p-2 shadow-2xl" id="certificate">
            <div className="border-8 border-double border-amber-800 p-8 md:p-12 relative">
              {/* Corner ornaments */}
              <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-amber-600" />
              <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-amber-600" />
              <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-amber-600" />
              <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-amber-600" />

              {/* Header */}
              <div className="text-center mb-8">
                <TelegraphKey className="w-20 h-10 text-amber-700 mx-auto mb-4" />
                <h1
                  className="font-serif text-4xl md:text-5xl font-bold text-amber-900 tracking-wide mb-2"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                >
                  CERTIFICATE
                </h1>
                <p className="font-mono text-sm tracking-[0.3em] text-amber-600">
                  OF MORSE CODE PROFICIENCY
                </p>
              </div>

              {/* Divider */}
              <div className="flex items-center justify-center mb-8">
                <div className="h-px w-full bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
              </div>

              {/* Body */}
              <div className="text-center mb-8">
                <p className="font-serif text-lg text-amber-800 mb-6">
                  This is to certify that
                </p>
                <p className="font-mono text-5xl font-bold text-amber-900 mb-2 border-b-2 border-amber-300 pb-2 inline-block px-8 tracking-wider">
                  {userCall}
                </p>
                <p className="font-serif text-lg text-amber-800 mt-6 mb-4">
                  has successfully demonstrated proficiency in the reception of
                  <br />
                  International Morse Code at a speed of
                </p>
                <p
                  className="font-serif text-5xl font-bold text-amber-900"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                >
                  {currentTest.speed_wpm} WPM
                </p>
                <p className="font-mono text-sm tracking-widest text-amber-600 mt-2">
                  {currentTest.title.toUpperCase()} EXAMINATION
                </p>
              </div>

              {/* Footer */}
              <div className="flex justify-between items-end mt-12 pt-8 border-t border-amber-200">
                <div className="text-center">
                  <p className="font-mono text-xs text-amber-600 mb-1">
                    DATE ISSUED
                  </p>
                  <p className="font-serif text-amber-900">{formatDate()}</p>
                </div>
                <div className="text-center">
                  <div className="w-32 h-16 border-2 border-amber-300 flex items-center justify-center mb-1">
                    <span className="font-mono text-xs text-amber-400">
                      SEAL
                    </span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="font-mono text-xs text-amber-600 mb-1">
                    CERTIFICATE NO.
                  </p>
                  <p className="font-mono text-amber-900 text-sm">
                    {certificateNumber ||
                      `${currentTest.id}-${Date.now().toString(36).toUpperCase()}`}
                  </p>
                </div>
              </div>

              {/* Bottom note */}
              <div className="mt-8 pt-4 border-t border-amber-200 text-center">
                <p className="font-serif text-xs text-amber-600 italic">
                  Historical examination courtesy of WB4WXD & KB6NU
                </p>
                <p className="font-mono text-xs text-amber-400 mt-2">
                  KNOWCODEEXTRA.COM • {morsePatterns.AR}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Leaderboard Page
  if (view === "leaderboard") {
    return (
      <div className="min-h-screen bg-amber-50 text-stone-800 relative">
        <VintagePattern />

        <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
          <div className="bg-amber-50/95 backdrop-blur-sm shadow-2xl shadow-amber-900/10 border border-amber-200/50 px-8 py-10 md:px-12">
            <button
              onClick={() => setView("home")}
              className="font-mono text-sm text-amber-700 hover:text-amber-900 mb-8 flex items-center gap-2 font-medium"
            >
              {"\u2190"} RETURN HOME
            </button>

            <h1
              className="font-serif text-4xl font-bold text-amber-900 mb-2 text-center drop-shadow-sm"
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                textShadow: "1px 1px 3px rgba(120, 53, 15, 0.1)",
              }}
            >
              Honor Roll
            </h1>
            <p className="text-center text-amber-700 mb-8 font-serif italic">
              Operators who have demonstrated CW proficiency
            </p>

            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-white border-2 border-amber-300 p-4 text-center shadow-sm">
                  <p className="font-mono text-xs text-amber-600 mb-1">
                    TOTAL ATTEMPTS
                  </p>
                  <p className="font-serif text-2xl font-bold text-amber-900">
                    {stats.total_attempts}
                  </p>
                </div>
                <div className="bg-white border-2 border-amber-300 p-4 text-center shadow-sm">
                  <p className="font-mono text-xs text-amber-600 mb-1">
                    PASSES
                  </p>
                  <p className="font-serif text-2xl font-bold text-amber-900">
                    {stats.total_passes}
                  </p>
                </div>
                <div className="bg-white border-2 border-amber-300 p-4 text-center shadow-sm">
                  <p className="font-mono text-xs text-amber-600 mb-1">
                    OPERATORS
                  </p>
                  <p className="font-serif text-2xl font-bold text-amber-900">
                    {stats.unique_callsigns}
                  </p>
                </div>
              </div>
            )}

            {/* Leaderboard Table */}
            <div className="bg-white border-2 border-amber-300 shadow-md overflow-hidden">
              <div className="bg-amber-900 text-amber-50 px-6 py-3">
                <div className="grid grid-cols-12 gap-4 font-mono text-xs tracking-widest">
                  <div className="col-span-1">#</div>
                  <div className="col-span-4">CALLSIGN</div>
                  <div className="col-span-3 text-center">HIGHEST WPM</div>
                  <div className="col-span-2 text-center">PASSES</div>
                  <div className="col-span-2 text-center">ATTEMPTS</div>
                </div>
              </div>

              {leaderboard.length === 0 ? (
                <div className="px-6 py-12 text-center text-amber-600 font-serif italic">
                  No attempts recorded yet. Be the first!
                </div>
              ) : (
                <div className="divide-y divide-amber-200">
                  {leaderboard.map((entry, index) => (
                    <div
                      key={entry.callsign}
                      className={`px-6 py-4 ${index < 3 ? "bg-amber-50" : ""}`}
                    >
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-1 font-mono text-amber-600 font-bold">
                          {index === 0
                            ? "\uD83E\uDD47"
                            : index === 1
                              ? "\uD83E\uDD48"
                              : index === 2
                                ? "\uD83E\uDD49"
                                : index + 1}
                        </div>
                        <div className="col-span-4 font-mono text-lg font-bold text-amber-900">
                          {entry.callsign}
                        </div>
                        <div className="col-span-3 text-center">
                          <span className="inline-block bg-amber-100 border border-amber-300 px-3 py-1 font-mono font-bold text-amber-800">
                            {entry.highest_speed_passed} WPM
                          </span>
                        </div>
                        <div className="col-span-2 text-center font-mono text-amber-700">
                          {entry.total_passes}
                        </div>
                        <div className="col-span-2 text-center font-mono text-amber-600">
                          {entry.total_attempts}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CTA */}
            <div className="mt-8 flex justify-center gap-4">
              <button
                onClick={() => {
                  fetchRoster();
                  setView("roster");
                }}
                className="font-mono text-sm text-amber-700 hover:text-amber-900 underline underline-offset-4"
              >
                VIEW ROSTER
              </button>
              <button
                onClick={() => setView("select")}
                className="bg-amber-900 text-amber-50 px-8 py-4 font-mono tracking-widest
                        hover:bg-amber-800 transition-all shadow-lg"
              >
                TAKE THE TEST
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Roster Page
  if (view === "roster") {
    return (
      <div className="min-h-screen bg-amber-50 text-stone-800 relative">
        <VintagePattern />

        <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
          <div className="bg-amber-50/95 backdrop-blur-sm shadow-2xl shadow-amber-900/10 border border-amber-200/50 px-8 py-10 md:px-12">
            <button
              onClick={() => setView("home")}
              className="font-mono text-sm text-amber-700 hover:text-amber-900 mb-8 flex items-center gap-2 font-medium"
            >
              {"\u2190"} RETURN HOME
            </button>

            <h1
              className="font-serif text-4xl font-bold text-amber-900 mb-2 text-center drop-shadow-sm"
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                textShadow: "1px 1px 3px rgba(120, 53, 15, 0.1)",
              }}
            >
              Member Roster
            </h1>
            <p className="text-center text-amber-700 mb-8 font-serif italic">
              Certified Know Code Extra members
            </p>

            {/* Roster Table */}
            <div className="bg-white border-2 border-amber-300 shadow-md overflow-hidden">
              <div className="bg-amber-900 text-amber-50 px-6 py-3">
                <div className="grid grid-cols-12 gap-4 font-mono text-xs tracking-widest">
                  <div className="col-span-2">#</div>
                  <div className="col-span-4">CALLSIGN</div>
                  <div className="col-span-3 text-center">CERT #</div>
                  <div className="col-span-3 text-center">DATE</div>
                </div>
              </div>

              {roster.length === 0 ? (
                <div className="px-6 py-12 text-center text-amber-600 font-serif italic">
                  No members yet. Be the first!
                </div>
              ) : (
                <div className="divide-y divide-amber-200">
                  {roster.map((entry, index) => (
                    <div key={entry.callsign} className="px-6 py-4">
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-2 font-mono text-amber-600">
                          {index + 1}
                        </div>
                        <div className="col-span-4 font-mono text-lg font-bold text-amber-900">
                          {entry.callsign}
                        </div>
                        <div className="col-span-3 text-center">
                          <span className="inline-block bg-amber-100 border border-amber-300 px-3 py-1 font-mono text-amber-800">
                            #{entry.certificate_number}
                          </span>
                        </div>
                        <div className="col-span-3 text-center font-mono text-sm text-amber-700">
                          {entry.validated_at
                            ? new Date(entry.validated_at).toLocaleDateString()
                            : "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="mt-8 flex justify-center gap-4">
              <button
                onClick={() => {
                  fetchLeaderboard();
                  fetchStats();
                  setView("leaderboard");
                }}
                className="font-mono text-sm text-amber-700 hover:text-amber-900 underline underline-offset-4"
              >
                VIEW LEADERBOARD
              </button>
              <button
                onClick={() => setView("select")}
                className="bg-amber-900 text-amber-50 px-6 py-3 font-mono tracking-widest hover:bg-amber-800"
              >
                TAKE THE TEST
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Blocked Page (already has a pending/approved attempt)
  if (view === "blocked") {
    return (
      <div className="min-h-screen bg-amber-50 text-stone-800 relative">
        <VintagePattern />
        <div className="relative z-10 max-w-2xl mx-auto px-6 py-12">
          <div className="bg-amber-50/95 backdrop-blur-sm shadow-2xl shadow-amber-900/10 border border-amber-200/50 p-8">
            <div className="text-center">
              <h1 className="font-serif text-3xl font-bold text-amber-900 mb-4">
                Already Submitted
              </h1>
              <p className="font-serif text-amber-800 mb-6">
                You already have a passed attempt awaiting verification.
              </p>
              <p className="font-serif text-amber-700 mb-8">
                While you wait, practice more at:
              </p>
              <div className="space-y-4">
                <a
                  href="https://morsestorytime.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-amber-900 text-amber-50 px-8 py-4 font-mono tracking-widest hover:bg-amber-800 transition-all"
                >
                  MORSE STORY TIME
                </a>
                <a
                  href="https://keyersjourney.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-white text-amber-900 px-8 py-4 font-mono tracking-widest border-2 border-amber-300 hover:border-amber-500 transition-all"
                >
                  KEYER'S JOURNEY
                </a>
              </div>
              <button
                onClick={() => setView("home")}
                className="mt-8 font-mono text-sm text-amber-700 hover:text-amber-900 underline"
              >
                Return Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

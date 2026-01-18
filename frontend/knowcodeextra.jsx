import React, { useState, useEffect, useRef } from "react";

// Audio segment definitions (times in seconds)
const audioSegments = [
  { name: "Intro", start: 0, end: 62, color: "bg-amber-600" },
  { name: "Practice", start: 62, end: 126, color: "bg-amber-500" },
  { name: "Instructions", start: 126, end: 221, color: "bg-amber-400" },
  { name: "Test", start: 221, end: 531, color: "bg-green-600" },
  { name: "Outro", start: 531, end: Infinity, color: "bg-amber-600" },
];

// Test data - 20 WPM Extra Class examination only
const testData = {
  "20wpm": {
    speed: 20,
    title: "Extra Class",
    year: "1991",
    audioUrl: "/audio/20wpm/test.mp3",
    questions: [
      {
        q: "What was the callsign of the first station?",
        options: ["W1AW", "K3ABC", "N0XYZ", "WB4WXD"],
        answer: 0,
      },
      {
        q: "What frequency was mentioned?",
        options: ["7.040 MHz", "14.060 MHz", "3.560 MHz", "21.040 MHz"],
        answer: 1,
      },
      {
        q: "What RST was given?",
        options: ["599", "559", "579", "449"],
        answer: 2,
      },
      {
        q: "What QTH was given?",
        options: ["Texas", "Ohio", "California", "Florida"],
        answer: 0,
      },
      {
        q: "What antenna was in use?",
        options: ["Dipole", "Yagi", "Vertical", "Loop"],
        answer: 0,
      },
      {
        q: "What was the OP's name?",
        options: ["John", "Mike", "Dave", "Bill"],
        answer: 2,
      },
      {
        q: "What band was mentioned?",
        options: ["40 meters", "20 meters", "80 meters", "15 meters"],
        answer: 1,
      },
      {
        q: "What PWR was reported?",
        options: ["5 watts", "100 watts", "50 watts", "1000 watts"],
        answer: 1,
      },
      {
        q: "What WX was mentioned?",
        options: ["Sunny", "Rainy", "Cloudy", "Snowy"],
        answer: 0,
      },
      {
        q: "What time was given?",
        options: ["Morning", "Afternoon", "Evening", "Night"],
        answer: 2,
      },
    ],
  },
};

// Morse code for decorative elements
const morsePatterns = {
  BT: "−··· −",
  CQ: "−·−· −−·−",
  DE: "−·· ·",
  K: "−·−",
  AR: "·−·−·",
  SK: "···−·−",
};

// Vintage-style background pattern component
const VintagePattern = () => (
  <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-[0.03]">
    <div
      className="absolute inset-0"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}
    />
  </div>
);

// Telegraph key decorative element
const TelegraphKey = ({ className = "" }) => (
  <svg viewBox="0 0 120 60" className={className} fill="currentColor">
    <ellipse cx="60" cy="50" rx="55" ry="8" opacity="0.3" />
    <rect x="20" y="35" width="80" height="12" rx="2" />
    <rect x="55" y="20" width="10" height="20" rx="1" />
    <circle cx="60" cy="15" r="8" />
    <rect x="10" y="42" width="100" height="4" rx="2" opacity="0.5" />
  </svg>
);

// Confirmation Modal component
const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "Yes", cancelText = "Cancel" }) => {
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

        <h2 className="font-serif text-2xl font-bold text-amber-900 mb-4 text-center"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
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

// API Configuration - empty string means same-origin requests
const API_BASE = "";

// Main App Component
export default function KnowCodeExtra() {
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
  const [stats, setStats] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState(null);
  const [modal, setModal] = useState({ isOpen: false, type: null, testKey: null });
  const audioRef = useRef(null);

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

  const handleStartTest = (testKey) => {
    setSelectedTest(testKey);
    setAnswers({});
    setCopyText("");
    setTestComplete(false);
    setScore(null);
    setPassed(false);
    setAudioPlayed(false);
    setAudioProgress(0);
    setAudioCurrentTime(0);
    setView("test");
  };

  const handleAnswer = (questionIndex, answerIndex) => {
    setAnswers((prev) => ({ ...prev, [questionIndex]: answerIndex }));
  };

  // Show abandon confirmation modal
  const handleAbandon = () => {
    setModal({ isOpen: true, type: "abandon", testKey: null });
  };

  // Actually abandon the test
  const confirmAbandon = async () => {
    setModal({ isOpen: false, type: null, testKey: null });
    if (selectedTest) {
      const test = testData[selectedTest];
      // Log a failed attempt
      await submitAttempt({
        callsign: userCall,
        test_speed: test.speed,
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
    const testKey = modal.testKey;
    setModal({ isOpen: false, type: null, testKey: null });
    handleStartTest(testKey);
  };

  // Close modal without action
  const closeModal = () => {
    setModal({ isOpen: false, type: null, testKey: null });
  };

  const calculateResults = async () => {
    const test = testData[selectedTest];
    let correct = 0;
    test.questions.forEach((q, i) => {
      if (answers[i] === q.answer) correct++;
    });

    const copyChars = copyText.replace(/\s/g, "").length;
    const passedQuestions = correct >= 7;
    const passedCopy = copyChars >= 100;
    const didPass = passedQuestions || passedCopy;

    setScore({ correct, total: 10, copyChars });
    setPassed(didPass);
    setTestComplete(true);
    setIsSubmitting(true);

    // Submit to API
    const result = await submitAttempt({
      callsign: userCall,
      test_speed: test.speed,
      questions_correct: correct,
      copy_chars: copyChars,
      passed: didPass,
      audio_progress: audioProgress,
    });

    if (result?.blocked) {
      setBlockedMessage(result.message);
      setView("blocked");
      setIsSubmitting(false);
      return;
    }

    if (result?.success && result.data?.certificate_number) {
      setCertificateNumber(result.data.certificate_number);
    }

    setIsSubmitting(false);
    setView("results");
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

  // Get current audio segment based on playback time
  const getCurrentSegment = (currentTime) => {
    return audioSegments.find(
      (seg) => currentTime >= seg.start && currentTime < seg.end
    ) || audioSegments[0];
  };

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
                "Take the historic FCC Morse Code examinations and prove your
                proficiency with an authentic certificate"
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
                  →
                </span>
              </button>
              <div>
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
              ← RETURN HOME
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
              {Object.entries(testData).map(([key, test]) => (
                <button
                  key={key}
                  onClick={() => handleStartClick(key)}
                  disabled={!userCall.trim()}
                  className={`group bg-white border-2 border-amber-300 p-8 text-left
                           transition-all duration-300 relative overflow-hidden shadow-md
                           ${
                             userCall.trim()
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
                      {test.speed} WPM
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
                        →
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Rate limit note */}
            <div className="mt-8 p-4 bg-red-50 border-2 border-red-200 shadow-sm">
              <p className="font-mono text-red-800 text-sm text-center font-medium">
                ⚠ You may only attempt this examination once per day
              </p>
            </div>

            {/* Historical note */}
            <div className="mt-4 p-6 bg-amber-100 border-l-4 border-amber-600 shadow-sm">
              <p className="font-serif text-amber-800 text-sm leading-relaxed">
                <strong>Historical Note:</strong> From 1936 until 2007, the FCC
                required amateur radio operators to demonstrate Morse code
                proficiency. The 20 WPM test was required for the Amateur
                Extra class license.
              </p>
            </div>
          </div>{" "}
          {/* End main content card */}

          {/* Start confirmation modal */}
          <ConfirmModal
            isOpen={modal.isOpen && modal.type === "start"}
            title="Begin Examination"
            message={"Are you sure you want to start the test?\n\nYou may only attempt this examination once per day. Once you begin, abandoning the test will count as a failed attempt."}
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
    const test = testData[selectedTest];

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
                ← ABANDON TEST
              </button>
              <div className="text-right">
                <span className="font-mono text-sm text-amber-600 block font-medium">
                  {test.title}
                </span>
                <span className="font-serif text-2xl font-bold text-amber-900">
                  {test.speed} WPM
                </span>
              </div>
            </div>

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
                src={test.audioUrl}
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
                          ${audioPlayed
                            ? "bg-amber-800 text-amber-500 cursor-not-allowed"
                            : "bg-amber-100 text-amber-900 hover:bg-white"}`}
                >
                  {audioPlayed ? "✓" : isPlaying ? "❚❚" : "▶"}
                </button>

                <div className="flex-1">
                  {/* Segment timeline */}
                  <div className="flex h-3 rounded-full overflow-hidden mb-1">
                    {audioSegments.map((seg, i) => {
                      const totalDuration = audioDuration || 531; // fallback to expected duration
                      const segEnd = seg.end === Infinity ? totalDuration : seg.end;
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
                                width: `${((audioCurrentTime - seg.start) / segDuration) * 100}%`
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Segment labels */}
                  <div className="flex mb-2">
                    {audioSegments.map((seg) => {
                      const totalDuration = audioDuration || 531;
                      const segEnd = seg.end === Infinity ? totalDuration : seg.end;
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
                      {audioPlayed ? "TRANSMISSION COMPLETE" : isPlaying ? "TRANSMITTING..." : "READY TO TRANSMIT"}
                    </p>
                    <p className="font-mono text-xs text-amber-300">
                      {formatTime(audioCurrentTime)} / {formatTime(audioDuration)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Copy Area */}
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
              <p className="font-serif text-xs text-amber-700 mt-2 italic">
                Copy 100 characters (1 minute) solidly to pass, OR answer 7 of
                10 questions correctly.
              </p>
            </div>

            {/* Questions */}
            <div className="bg-white border-2 border-amber-300 p-6 mb-8 shadow-md">
              <h3 className="font-mono text-sm tracking-widest text-amber-900 mb-6 font-bold">
                COMPREHENSION QUESTIONS
              </h3>

              <div className="space-y-6">
                {test.questions.map((q, qi) => (
                  <div
                    key={qi}
                    className="border-b border-amber-200 pb-6 last:border-0"
                  >
                    <p className="font-serif text-amber-900 mb-3">
                      <span className="font-mono text-amber-600 mr-2 font-medium">
                        {qi + 1}.
                      </span>
                      {q.q}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {q.options.map((opt, oi) => (
                        <button
                          key={oi}
                          onClick={() => handleAnswer(qi, oi)}
                          className={`p-3 text-left font-serif text-sm border-2 transition-all
                                   ${
                                     answers[qi] === oi
                                       ? "border-amber-600 bg-amber-100 text-amber-900"
                                       : "border-amber-300 bg-amber-50 hover:border-amber-500 text-amber-800"
                                   }`}
                        >
                          <span className="font-mono text-xs text-amber-600 mr-2 font-medium">
                            {String.fromCharCode(65 + oi)}.
                          </span>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="text-center">
              <button
                onClick={calculateResults}
                className="bg-amber-900 text-amber-50 px-12 py-4 font-mono tracking-widest
                        hover:bg-amber-800 transition-all shadow-lg hover:shadow-xl"
              >
                SUBMIT EXAMINATION
              </button>
            </div>
          </div>{" "}
          {/* End main content card */}

          {/* Abandon confirmation modal */}
          <ConfirmModal
            isOpen={modal.isOpen && modal.type === "abandon"}
            title="Abandon Test?"
            message={"Are you sure you want to abandon this test?\n\nYou may only attempt the test once per day. If you abandon now, you won't be able to try again until tomorrow."}
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
    const test = testData[selectedTest];

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
                    ✓
                  </div>
                ) : (
                  <div className="w-24 h-24 mx-auto rounded-full bg-red-600 text-white flex items-center justify-center text-5xl shadow-lg">
                    ✗
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
                {test.speed} WPM {test.title} Code Test
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
                    {score.correct >= 7 ? "✓ PASSED" : "✗ Need 7+"}
                  </p>
                </div>
                <div className="bg-white p-6 border-2 border-amber-300 shadow-sm">
                  <p className="font-mono text-xs text-amber-600 mb-1 font-medium">
                    COPY
                  </p>
                  <p className="font-serif text-3xl font-bold text-amber-900">
                    {score.copyChars} chars
                  </p>
                  <p className="font-mono text-xs text-amber-600 mt-1 font-medium">
                    {score.copyChars >= 100 ? "✓ PASSED" : "✗ Need 100+"}
                  </p>
                </div>
              </div>

              {passed && (
                <div className="bg-amber-100 border-2 border-amber-400 p-6 mb-6">
                  <h3 className="font-mono text-sm text-amber-800 mb-2 font-bold">
                    VERIFICATION PENDING
                  </h3>
                  <p className="font-serif text-amber-800">
                    Congratulations! Your result has been submitted for verification.
                    Once approved, you'll be able to view and download your official certificate.
                  </p>
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
    const test = testData[selectedTest];

    return (
      <div className="min-h-screen bg-stone-800 py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <button
              onClick={() => setView("select")}
              className="font-mono text-sm text-stone-400 hover:text-stone-200 mb-4"
            >
              ← Take Another Test
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
                  {test.speed} WPM
                </p>
                <p className="font-mono text-sm tracking-widest text-amber-600 mt-2">
                  {test.title.toUpperCase()} EXAMINATION
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
                      `${selectedTest.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`}
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
              ← RETURN HOME
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
                            ? "🥇"
                            : index === 1
                              ? "🥈"
                              : index === 2
                                ? "🥉"
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
            <div className="mt-8 text-center">
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

// ============================================================================
// ADMIN PORTAL
// ============================================================================

// Admin Auth Context
const AdminAuthContext = React.createContext(null);

function AdminAuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const login = async (username, password) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Login failed");
      }

      const data = await response.json();
      setToken(data.token);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
  };

  const adminFetch = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      logout();
      throw new Error("Session expired");
    }

    return response;
  };

  return (
    <AdminAuthContext.Provider value={{ token, login, logout, adminFetch, isLoading, isAuthenticated: !!token }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

function useAdminAuth() {
  const context = React.useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return context;
}

// Admin Login Page
function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const { login, isLoading } = useAdminAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const result = await login(username, password);
    if (!result.success) {
      setError(result.error);
    }
  };

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center p-4">
      <div className="bg-white border-4 border-amber-800 shadow-2xl max-w-md w-full p-8 relative">
        <div className="text-center mb-8">
          <TelegraphKey className="w-16 h-8 text-amber-800 mx-auto mb-4" />
          <h1
            className="font-serif text-3xl font-bold text-amber-900"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Admin Portal
          </h1>
          <p className="font-mono text-xs text-amber-600 mt-2">KNOW CODE EXTRA</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border-2 border-red-300 p-3 text-red-800 font-mono text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="font-mono text-xs text-amber-700 block mb-1 font-medium">
              USERNAME
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border-2 border-amber-300 bg-amber-50 px-4 py-3 font-mono
                       focus:border-amber-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="font-mono text-xs text-amber-700 block mb-1 font-medium">
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-2 border-amber-300 bg-amber-50 px-4 py-3 font-mono
                       focus:border-amber-500 focus:outline-none"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-amber-900 text-amber-50 px-6 py-4 font-mono tracking-widest
                     hover:bg-amber-800 transition-all disabled:opacity-50"
          >
            {isLoading ? "SIGNING IN..." : "SIGN IN"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <a href="/" className="font-mono text-sm text-amber-600 hover:text-amber-800">
            &larr; Return to main site
          </a>
        </div>
      </div>
    </div>
  );
}

// Toast notification component
function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === "success" ? "bg-green-600" : "bg-red-600";

  return (
    <div className={`fixed bottom-4 right-4 ${bgColor} text-white px-6 py-3 shadow-lg font-mono text-sm z-50`}>
      {message}
    </div>
  );
}

// Admin Layout with Sidebar
function AdminLayout({ children, currentPage, pendingCount = 0 }) {
  const { logout } = useAdminAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "queue", label: "Queue", icon: "📋", badge: pendingCount },
    { id: "approved", label: "Approved", icon: "✓" },
    { id: "search", label: "Search", icon: "🔍" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <div className="min-h-screen bg-amber-50 flex">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-4 left-4 z-50 bg-amber-900 text-amber-50 p-2"
      >
        {sidebarOpen ? "✕" : "☰"}
      </button>

      {/* Sidebar */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-40
        w-64 bg-amber-900 text-amber-50 transform transition-transform
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="p-6 border-b border-amber-800">
          <h1 className="font-serif text-xl font-bold">Admin Portal</h1>
          <p className="font-mono text-xs text-amber-400 mt-1">KNOW CODE EXTRA</p>
        </div>

        <nav className="p-4 space-y-2">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#/admin/${item.id}`}
              onClick={() => setSidebarOpen(false)}
              className={`
                flex items-center gap-3 px-4 py-3 font-mono text-sm transition-colors
                ${currentPage === item.id
                  ? "bg-amber-800 text-amber-50"
                  : "text-amber-300 hover:bg-amber-800 hover:text-amber-50"
                }
              `}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.badge > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </a>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-amber-800">
          <button
            onClick={logout}
            className="w-full px-4 py-2 font-mono text-sm text-amber-300 hover:text-amber-50 hover:bg-amber-800 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 md:ml-0">
        <header className="bg-white border-b border-amber-200 px-6 py-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl font-bold text-amber-900 capitalize ml-12 md:ml-0">
            {currentPage}
          </h2>
        </header>
        <main className="p-6">
          {children}
        </main>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

// Admin Dashboard Page
function AdminDashboard({ onNavigate }) {
  const { adminFetch } = useAdminAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/stats`);
      if (!response.ok) throw new Error("Failed to fetch stats");
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const handleFocus = () => fetchStats();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="font-mono text-amber-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-2 border-red-300 p-6 text-center">
        <p className="text-red-800 font-mono mb-4">{error}</p>
        <button
          onClick={fetchStats}
          className="bg-red-600 text-white px-4 py-2 font-mono text-sm hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const statCards = [
    { label: "Pending", value: stats.pending_count, highlight: stats.pending_count > 0 },
    { label: "Approved Today", value: stats.approved_today },
    { label: "Total Certificates", value: stats.total_certificates },
    { label: "Rejections", value: stats.rejected_count },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`bg-white border-2 p-6 shadow-sm ${
              card.highlight ? "border-amber-500 bg-amber-50" : "border-amber-300"
            }`}
          >
            <p className="font-mono text-xs text-amber-600 mb-1">{card.label.toUpperCase()}</p>
            <p className="font-serif text-3xl font-bold text-amber-900">{card.value}</p>
          </div>
        ))}
      </div>

      {stats.pending_count > 0 && (
        <div className="bg-amber-100 border-2 border-amber-400 p-4 flex items-center justify-between">
          <p className="font-serif text-amber-800">
            You have <strong>{stats.pending_count}</strong> attempt(s) awaiting review
          </p>
          <button
            onClick={() => onNavigate("queue")}
            className="bg-amber-900 text-amber-50 px-4 py-2 font-mono text-sm hover:bg-amber-800"
          >
            Review Queue
          </button>
        </div>
      )}

      <div className="bg-white border-2 border-amber-300 shadow-sm">
        <div className="bg-amber-900 text-amber-50 px-6 py-3">
          <h3 className="font-mono text-sm tracking-widest">RECENT ACTIVITY</h3>
        </div>
        <div className="divide-y divide-amber-200">
          {stats.recent_activity.length === 0 ? (
            <p className="px-6 py-8 text-center text-amber-600 font-serif italic">
              No recent activity
            </p>
          ) : (
            stats.recent_activity.map((item) => (
              <div key={item.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <span className="font-mono text-amber-900 font-bold">{item.callsign}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 font-mono ${
                    item.action === "approved"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}>
                    {item.action}
                  </span>
                </div>
                <span className="font-mono text-xs text-amber-600">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Admin Queue Page
function AdminQueue({ onPendingCountChange }) {
  const { adminFetch } = useAdminAuth();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCallsign, setExpandedCallsign] = useState(null);
  const [history, setHistory] = useState({});
  const [toast, setToast] = useState(null);
  const [rejectModal, setRejectModal] = useState({ isOpen: false, attemptId: null });
  const [rejectNote, setRejectNote] = useState("");

  const fetchQueue = async () => {
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/queue`);
      if (!response.ok) throw new Error("Failed to fetch queue");
      const data = await response.json();
      setQueue(data);
      onPendingCountChange?.(data.length);
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (callsign) => {
    if (history[callsign]) return;
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/queue/${callsign}/history`);
      if (!response.ok) throw new Error("Failed to fetch history");
      const data = await response.json();
      setHistory((prev) => ({ ...prev, [callsign]: data }));
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    }
  };

  const handleApprove = async (attemptId) => {
    // Optimistic update
    const item = queue.find((q) => q.id === attemptId);
    setQueue((prev) => prev.filter((q) => q.id !== attemptId));

    try {
      const response = await adminFetch(`${API_BASE}/api/admin/queue/${attemptId}/approve`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to approve");
      const data = await response.json();
      setToast({ message: `Approved - Certificate #${data.certificate_number}`, type: "success" });
      onPendingCountChange?.(queue.length - 1);
    } catch (err) {
      // Rollback
      setQueue((prev) => [...prev, item].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
      setToast({ message: err.message, type: "error" });
    }
  };

  const handleReject = async () => {
    const attemptId = rejectModal.attemptId;
    const item = queue.find((q) => q.id === attemptId);
    setQueue((prev) => prev.filter((q) => q.id !== attemptId));
    setRejectModal({ isOpen: false, attemptId: null });

    try {
      const response = await adminFetch(`${API_BASE}/api/admin/queue/${attemptId}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: rejectNote || null }),
      });
      if (!response.ok) throw new Error("Failed to reject");
      setToast({ message: "Rejected", type: "success" });
      setRejectNote("");
      onPendingCountChange?.(queue.length - 1);
    } catch (err) {
      setQueue((prev) => [...prev, item].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
      setToast({ message: err.message, type: "error" });
    }
  };

  const toggleHistory = (callsign) => {
    if (expandedCallsign === callsign) {
      setExpandedCallsign(null);
    } else {
      setExpandedCallsign(callsign);
      fetchHistory(callsign);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const formatRelativeTime = (date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    const mins = Math.floor(diff / (1000 * 60));
    return `${mins}m ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="font-mono text-amber-600">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="bg-white border-2 border-amber-300 shadow-sm">
        <div className="bg-amber-900 text-amber-50 px-6 py-3">
          <h3 className="font-mono text-sm tracking-widest">PENDING VALIDATION</h3>
        </div>

        {queue.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-serif text-xl text-amber-800 mb-2">No pending attempts</p>
            <p className="font-mono text-sm text-amber-600">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-amber-200">
            {queue.map((item) => (
              <div key={item.id}>
                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex-1">
                    <button
                      onClick={() => toggleHistory(item.callsign)}
                      className="font-mono text-lg font-bold text-amber-900 hover:text-amber-700"
                    >
                      {item.callsign}
                      <span className="ml-2 text-xs text-amber-500">
                        {expandedCallsign === item.callsign ? "▼" : "▶"}
                      </span>
                    </button>
                    <div className="flex gap-4 mt-1 font-mono text-sm text-amber-600">
                      <span>{item.questions_correct}/10</span>
                      <span>{item.copy_chars} chars</span>
                      <span>{formatRelativeTime(item.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(item.id)}
                      className="bg-green-600 text-white px-4 py-2 font-mono text-sm hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectModal({ isOpen: true, attemptId: item.id })}
                      className="bg-red-600 text-white px-4 py-2 font-mono text-sm hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                </div>

                {/* History panel */}
                {expandedCallsign === item.callsign && history[item.callsign] && (
                  <div className="bg-amber-50 px-6 py-4 border-t border-amber-200">
                    <h4 className="font-mono text-xs text-amber-700 mb-2">HISTORY FOR {item.callsign}</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full font-mono text-sm">
                        <thead>
                          <tr className="text-amber-600 text-left">
                            <th className="pr-4">Date</th>
                            <th className="pr-4">Score</th>
                            <th className="pr-4">Copy</th>
                            <th className="pr-4">Passed</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history[item.callsign].map((h) => (
                            <tr key={h.id} className="text-amber-800">
                              <td className="pr-4 py-1">{new Date(h.created_at).toLocaleDateString()}</td>
                              <td className="pr-4">{h.questions_correct}/10</td>
                              <td className="pr-4">{h.copy_chars}</td>
                              <td className="pr-4">{h.passed ? "Yes" : "No"}</td>
                              <td>{h.validation_status || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRejectModal({ isOpen: false, attemptId: null })} />
          <div className="relative bg-amber-50 border-4 border-amber-800 shadow-2xl max-w-md w-full p-8">
            <h2 className="font-serif text-2xl font-bold text-amber-900 mb-4">Reject Attempt</h2>
            <div className="mb-4">
              <label className="font-mono text-xs text-amber-700 block mb-1">NOTE (OPTIONAL)</label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="w-full border-2 border-amber-300 bg-white p-3 font-mono text-sm h-24 focus:border-amber-500 focus:outline-none"
                placeholder="Reason for rejection..."
              />
            </div>
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setRejectModal({ isOpen: false, attemptId: null })}
                className="px-4 py-2 font-mono text-sm border-2 border-amber-300 text-amber-800 hover:border-amber-500"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2 font-mono text-sm bg-red-600 text-white hover:bg-red-700"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Admin Approved Page
function AdminApproved() {
  const { adminFetch } = useAdminAuth();
  const [data, setData] = useState({ items: [], total: 0, page: 1, per_page: 25 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null); // null = all, false = not reached out, true = reached out
  const [selected, setSelected] = useState(new Set());
  const [toast, setToast] = useState(null);

  const fetchApproved = async (page = 1) => {
    setLoading(true);
    try {
      let url = `${API_BASE}/api/admin/approved?page=${page}&per_page=25`;
      if (filter !== null) url += `&reached_out=${filter}`;
      const response = await adminFetch(url);
      if (!response.ok) throw new Error("Failed to fetch");
      const result = await response.json();
      setData(result);
      setSelected(new Set());
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkReachedOut = async () => {
    if (selected.size === 0) return;

    const ids = Array.from(selected);
    // Optimistic update
    setData((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        ids.includes(item.id) ? { ...item, reached_out: true } : item
      ),
    }));
    setSelected(new Set());

    try {
      const response = await adminFetch(`${API_BASE}/api/admin/approved/mark-reached-out`, {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error("Failed to mark");
      const result = await response.json();
      setToast({ message: `Marked ${result.count} as reached out`, type: "success" });
    } catch (err) {
      fetchApproved(data.page); // Rollback by refetching
      setToast({ message: err.message, type: "error" });
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((i) => i.id)));
    }
  };

  const copyEmail = (email) => {
    navigator.clipboard.writeText(email);
    setToast({ message: "Email copied", type: "success" });
  };

  useEffect(() => {
    fetchApproved(1);
  }, [filter]);

  const totalPages = Math.ceil(data.total / data.per_page);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Actions bar */}
      <div className="bg-white border-2 border-amber-300 p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleMarkReachedOut}
            disabled={selected.size === 0}
            className="bg-amber-900 text-amber-50 px-4 py-2 font-mono text-sm hover:bg-amber-800 disabled:opacity-50"
          >
            Mark Selected as Reached Out
          </button>
          <span className="font-mono text-sm text-amber-600">{selected.size} selected</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-amber-600">Filter:</span>
          <select
            value={filter === null ? "all" : filter.toString()}
            onChange={(e) => setFilter(e.target.value === "all" ? null : e.target.value === "true")}
            className="border-2 border-amber-300 px-3 py-1 font-mono text-sm focus:outline-none focus:border-amber-500"
          >
            <option value="all">All</option>
            <option value="false">Not Reached Out</option>
            <option value="true">Reached Out</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border-2 border-amber-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-amber-900 text-amber-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={data.items.length > 0 && selected.size === data.items.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">CALLSIGN</th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">EMAIL</th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">CERT #</th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">APPROVED</th>
                <th className="px-4 py-3 text-left font-mono text-xs tracking-widest">REACHED OUT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center font-mono text-amber-600">
                    Loading...
                  </td>
                </tr>
              ) : data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center font-serif italic text-amber-600">
                    No approved attempts
                  </td>
                </tr>
              ) : (
                data.items.map((item) => (
                  <tr
                    key={item.id}
                    className={item.reached_out ? "opacity-50" : ""}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-amber-900">{item.callsign}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-amber-700">{item.email || "Not found"}</span>
                        {item.email && (
                          <button
                            onClick={() => copyEmail(item.email)}
                            className="text-amber-500 hover:text-amber-700"
                            title="Copy email"
                          >
                            📋
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/api/certificate/${item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-amber-600 hover:text-amber-800 underline"
                      >
                        #{item.certificate_number}
                      </a>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-amber-700">
                      {item.validated_at ? new Date(item.validated_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 font-mono ${
                        item.reached_out
                          ? "bg-green-100 text-green-800"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {item.reached_out ? "Yes" : "No"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-amber-200 flex items-center justify-between">
            <span className="font-mono text-sm text-amber-600">
              Showing {((data.page - 1) * data.per_page) + 1}-{Math.min(data.page * data.per_page, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => fetchApproved(data.page - 1)}
                disabled={data.page <= 1}
                className="px-3 py-1 font-mono text-sm border border-amber-300 hover:bg-amber-100 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                onClick={() => fetchApproved(data.page + 1)}
                disabled={data.page >= totalPages}
                className="px-3 py-1 font-mono text-sm border border-amber-300 hover:bg-amber-100 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Admin Search Page
function AdminSearch() {
  const { adminFetch } = useAdminAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [toast, setToast] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (attemptId) => {
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/queue/${attemptId}/approve`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to approve");
      const data = await response.json();
      setToast({ message: `Approved - Certificate #${data.certificate_number}`, type: "success" });
      // Refresh search results
      handleSearch({ preventDefault: () => {} });
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    }
  };

  const handleReject = async (attemptId) => {
    try {
      const response = await adminFetch(`${API_BASE}/api/admin/queue/${attemptId}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: null }),
      });
      if (!response.ok) throw new Error("Failed to reject");
      setToast({ message: "Rejected", type: "success" });
      handleSearch({ preventDefault: () => {} });
    } catch (err) {
      setToast({ message: err.message, type: "error" });
    }
  };

  // Group results by callsign
  const grouped = results.reduce((acc, item) => {
    if (!acc[item.callsign]) acc[item.callsign] = [];
    acc[item.callsign].push(item);
    return acc;
  }, {});

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Search Form */}
      <form onSubmit={handleSearch} className="bg-white border-2 border-amber-300 p-6 mb-6">
        <div className="flex gap-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            className="flex-1 border-2 border-amber-300 px-4 py-3 font-mono uppercase
                     focus:border-amber-500 focus:outline-none"
            placeholder="Search by callsign (e.g., W1AW or W1)"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-amber-900 text-amber-50 px-6 py-3 font-mono tracking-widest
                     hover:bg-amber-800 disabled:opacity-50"
          >
            {loading ? "..." : "SEARCH"}
          </button>
        </div>
        <p className="font-mono text-xs text-amber-600 mt-2">
          Supports partial matches (e.g., "W1" finds all W1* callsigns)
        </p>
      </form>

      {/* Results */}
      {searched && (
        <div className="bg-white border-2 border-amber-300 shadow-sm">
          <div className="bg-amber-900 text-amber-50 px-6 py-3">
            <h3 className="font-mono text-sm tracking-widest">
              SEARCH RESULTS ({results.length})
            </h3>
          </div>

          {results.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-serif text-amber-800 mb-2">No attempts found for "{query}"</p>
              <p className="font-mono text-sm text-amber-600">Try a partial callsign or check spelling</p>
            </div>
          ) : (
            <div className="divide-y divide-amber-200">
              {Object.entries(grouped).map(([callsign, attempts]) => (
                <div key={callsign} className="px-6 py-4">
                  <h4 className="font-mono text-lg font-bold text-amber-900 mb-3">{callsign}</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full font-mono text-sm">
                      <thead>
                        <tr className="text-amber-600 text-left border-b border-amber-200">
                          <th className="pr-4 pb-2">Date</th>
                          <th className="pr-4 pb-2">Score</th>
                          <th className="pr-4 pb-2">Copy</th>
                          <th className="pr-4 pb-2">Passed</th>
                          <th className="pr-4 pb-2">Status</th>
                          <th className="pr-4 pb-2">Cert #</th>
                          <th className="pb-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attempts.map((item) => (
                          <tr key={item.id} className="text-amber-800">
                            <td className="pr-4 py-2">{new Date(item.created_at).toLocaleDateString()}</td>
                            <td className="pr-4">{item.questions_correct}/10</td>
                            <td className="pr-4">{item.copy_chars}</td>
                            <td className="pr-4">{item.passed ? "Yes" : "No"}</td>
                            <td className="pr-4">
                              <span className={`text-xs px-2 py-0.5 ${
                                item.validation_status === "approved" ? "bg-green-100 text-green-800" :
                                item.validation_status === "rejected" ? "bg-red-100 text-red-800" :
                                item.validation_status === "pending" ? "bg-amber-100 text-amber-800" :
                                "bg-gray-100 text-gray-800"
                              }`}>
                                {item.validation_status || "—"}
                              </span>
                            </td>
                            <td className="pr-4">
                              {item.certificate_number ? (
                                <a
                                  href={`/api/certificate/${item.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-amber-600 hover:text-amber-800 underline"
                                >
                                  #{item.certificate_number}
                                </a>
                              ) : "—"}
                            </td>
                            <td>
                              {item.validation_status === "pending" && (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleApprove(item.id)}
                                    className="text-xs bg-green-600 text-white px-2 py-1 hover:bg-green-700"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleReject(item.id)}
                                    className="text-xs bg-red-600 text-white px-2 py-1 hover:bg-red-700"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                              {item.admin_note && (
                                <span className="text-xs text-amber-600 ml-2" title={item.admin_note}>
                                  [note]
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Admin Settings Page
function AdminSettings() {
  const { adminFetch } = useAdminAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await adminFetch(`${API_BASE}/api/admin/settings`);
        if (!response.ok) throw new Error("Failed to fetch settings");
        const data = await response.json();
        setSettings(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="font-mono text-amber-600">Loading...</div>
      </div>
    );
  }

  const configItems = settings ? [
    { label: "Database", value: settings.database_url },
    { label: "Listen Address", value: settings.listen_addr },
    { label: "Static Directory", value: settings.static_dir },
    { label: "Log Level", value: settings.log_level },
    { label: "QRZ Integration", value: settings.qrz_enabled ? "Enabled" : "Disabled", status: settings.qrz_enabled },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="bg-white border-2 border-amber-300 shadow-sm">
        <div className="bg-amber-900 text-amber-50 px-6 py-3">
          <h3 className="font-mono text-sm tracking-widest">CURRENT CONFIGURATION</h3>
        </div>
        <div className="divide-y divide-amber-200">
          {configItems.map((item) => (
            <div key={item.label} className="px-6 py-4 flex items-center justify-between">
              <span className="font-mono text-sm text-amber-700">{item.label}</span>
              <span className="font-mono text-sm text-amber-900">
                {item.status !== undefined ? (
                  <span className={`px-2 py-1 text-xs ${item.status ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                    {item.value}
                  </span>
                ) : (
                  item.value
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-amber-100 border-l-4 border-amber-600 p-4">
        <p className="font-serif text-amber-800 text-sm">
          <strong>Note:</strong> Settings are configured via <code className="bg-amber-200 px-1">config.toml</code> or environment variables.
          Changes require a server restart.
        </p>
      </div>
    </div>
  );
}

// Admin App with Hash-based Routing
function AdminApp() {
  const { isAuthenticated } = useAdminAuth();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#/admin/")) {
        const page = hash.replace("#/admin/", "");
        if (["dashboard", "queue", "approved", "search", "settings"].includes(page)) {
          setCurrentPage(page);
        }
      }
    };
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const navigateTo = (page) => {
    window.location.hash = `/admin/${page}`;
    setCurrentPage(page);
  };

  if (!isAuthenticated) {
    return <AdminLogin />;
  }

  let content;
  switch (currentPage) {
    case "dashboard": content = <AdminDashboard onNavigate={navigateTo} />; break;
    case "queue": content = <AdminQueue onPendingCountChange={setPendingCount} />; break;
    case "approved": content = <AdminApproved />; break;
    case "search": content = <AdminSearch />; break;
    case "settings": content = <AdminSettings />; break;
    default: content = <AdminDashboard onNavigate={navigateTo} />;
  }

  return (
    <AdminLayout currentPage={currentPage} pendingCount={pendingCount}>
      {content}
    </AdminLayout>
  );
}

// Mount the app based on URL
function App() {
  const isAdminRoute = window.location.pathname.startsWith("/admin");

  if (isAdminRoute) {
    return (
      <AdminAuthProvider>
        <AdminApp />
      </AdminAuthProvider>
    );
  }

  return <KnowCodeExtra />;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));

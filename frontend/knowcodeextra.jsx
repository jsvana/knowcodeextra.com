import React, { useState, useEffect, useRef } from 'react';

// Sample test data structure - you'd expand this with actual test content
const testData = {
  '5wpm': {
    speed: 5,
    title: 'Novice Class',
    year: '1991',
    audioUrl: 'https://www.kb6nu.com/wp-content/uploads/2019/08/20wpm-Version-1C-4-91.mp3', // placeholder
    questions: [
      { q: "What was the callsign mentioned in the transmission?", options: ["W1AW", "K3ABC", "N0XYZ", "WB4WXD"], answer: 0 },
      { q: "What frequency was discussed?", options: ["7.040 MHz", "14.060 MHz", "3.560 MHz", "21.040 MHz"], answer: 1 },
      { q: "What was the signal report given?", options: ["599", "559", "579", "449"], answer: 2 },
      { q: "What state was the operator located in?", options: ["Texas", "Ohio", "California", "Florida"], answer: 0 },
      { q: "What type of antenna was mentioned?", options: ["Dipole", "Yagi", "Vertical", "Loop"], answer: 0 },
      { q: "What was the operator's name?", options: ["John", "Mike", "Dave", "Bill"], answer: 2 },
      { q: "What band were they operating on?", options: ["40 meters", "20 meters", "80 meters", "15 meters"], answer: 1 },
      { q: "What power level was mentioned?", options: ["5 watts", "100 watts", "50 watts", "1000 watts"], answer: 1 },
      { q: "What was the weather condition mentioned?", options: ["Sunny", "Rainy", "Cloudy", "Snowy"], answer: 0 },
      { q: "What time was the QSO?", options: ["Morning", "Afternoon", "Evening", "Night"], answer: 2 },
    ]
  },
  '13wpm': {
    speed: 13,
    title: 'General Class',
    year: '1991',
    audioUrl: 'https://www.kb6nu.com/wp-content/uploads/2019/08/20wpm-Version-1C-4-91.mp3',
    questions: [
      { q: "What was the callsign mentioned?", options: ["W1AW", "K3ABC", "N0XYZ", "WB4WXD"], answer: 0 },
      { q: "What frequency was discussed?", options: ["7.040 MHz", "14.060 MHz", "3.560 MHz", "21.040 MHz"], answer: 1 },
      { q: "What was the signal report?", options: ["599", "559", "579", "449"], answer: 2 },
      { q: "What state was mentioned?", options: ["Texas", "Ohio", "California", "Florida"], answer: 0 },
      { q: "What antenna type was discussed?", options: ["Dipole", "Yagi", "Vertical", "Loop"], answer: 0 },
      { q: "What was the operator's name?", options: ["John", "Mike", "Dave", "Bill"], answer: 2 },
      { q: "What band was in use?", options: ["40 meters", "20 meters", "80 meters", "15 meters"], answer: 1 },
      { q: "What power level was reported?", options: ["5 watts", "100 watts", "50 watts", "1000 watts"], answer: 1 },
      { q: "What weather was mentioned?", options: ["Sunny", "Rainy", "Cloudy", "Snowy"], answer: 0 },
      { q: "What time of day was it?", options: ["Morning", "Afternoon", "Evening", "Night"], answer: 2 },
    ]
  },
  '20wpm': {
    speed: 20,
    title: 'Extra Class',
    year: '1991',
    audioUrl: 'https://www.kb6nu.com/wp-content/uploads/2019/08/20wpm-Version-1C-4-91.mp3',
    questions: [
      { q: "What was the callsign of the first station?", options: ["W1AW", "K3ABC", "N0XYZ", "WB4WXD"], answer: 0 },
      { q: "What frequency was mentioned?", options: ["7.040 MHz", "14.060 MHz", "3.560 MHz", "21.040 MHz"], answer: 1 },
      { q: "What RST was given?", options: ["599", "559", "579", "449"], answer: 2 },
      { q: "What QTH was given?", options: ["Texas", "Ohio", "California", "Florida"], answer: 0 },
      { q: "What antenna was in use?", options: ["Dipole", "Yagi", "Vertical", "Loop"], answer: 0 },
      { q: "What was the OP's name?", options: ["John", "Mike", "Dave", "Bill"], answer: 2 },
      { q: "What band was mentioned?", options: ["40 meters", "20 meters", "80 meters", "15 meters"], answer: 1 },
      { q: "What PWR was reported?", options: ["5 watts", "100 watts", "50 watts", "1000 watts"], answer: 1 },
      { q: "What WX was mentioned?", options: ["Sunny", "Rainy", "Cloudy", "Snowy"], answer: 0 },
      { q: "What time was given?", options: ["Morning", "Afternoon", "Evening", "Night"], answer: 2 },
    ]
  }
};

// Morse code for decorative elements
const morsePatterns = {
  CQ: "−·−· −−·−",
  DE: "−·· ·",
  K: "−·−",
  AR: "·−·−·",
  SK: "···−·−"
};

// Vintage-style background pattern component
const VintagePattern = () => (
  <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-[0.03]">
    <div className="absolute inset-0" style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
    }} />
  </div>
);

// Telegraph key decorative element
const TelegraphKey = ({ className = "" }) => (
  <svg viewBox="0 0 120 60" className={className} fill="currentColor">
    <ellipse cx="60" cy="50" rx="55" ry="8" opacity="0.3"/>
    <rect x="20" y="35" width="80" height="12" rx="2" />
    <rect x="55" y="20" width="10" height="20" rx="1" />
    <circle cx="60" cy="15" r="8" />
    <rect x="10" y="42" width="100" height="4" rx="2" opacity="0.5"/>
  </svg>
);

// API Configuration - change this to your deployed backend URL
const API_BASE = 'http://localhost:3000';

// Main App Component
export default function KnowCodeExtra() {
  const [view, setView] = useState('home'); // home, select, test, results, certificate, leaderboard
  const [selectedTest, setSelectedTest] = useState(null);
  const [answers, setAnswers] = useState({});
  const [copyText, setCopyText] = useState('');
  const [testComplete, setTestComplete] = useState(false);
  const [score, setScore] = useState(null);
  const [passed, setPassed] = useState(false);
  const [userCall, setUserCall] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [certificateNumber, setCertificateNumber] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [stats, setStats] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      console.error('Failed to fetch leaderboard:', error);
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
      console.error('Failed to fetch stats:', error);
    }
  };

  // Submit attempt to API
  const submitAttempt = async (attemptData) => {
    try {
      const response = await fetch(`${API_BASE}/api/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attemptData),
      });
      if (response.ok) {
        const data = await response.json();
        return data;
      }
    } catch (error) {
      console.error('Failed to submit attempt:', error);
    }
    return null;
  };

  const handleStartTest = (testKey) => {
    setSelectedTest(testKey);
    setAnswers({});
    setCopyText('');
    setTestComplete(false);
    setScore(null);
    setPassed(false);
    setView('test');
  };

  const handleAnswer = (questionIndex, answerIndex) => {
    setAnswers(prev => ({ ...prev, [questionIndex]: answerIndex }));
  };

  const calculateResults = async () => {
    const test = testData[selectedTest];
    let correct = 0;
    test.questions.forEach((q, i) => {
      if (answers[i] === q.answer) correct++;
    });
    
    const copyChars = copyText.replace(/\s/g, '').length;
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
    });

    if (result?.certificate_number) {
      setCertificateNumber(result.certificate_number);
    }

    setIsSubmitting(false);
    setView('results');
  };

  const formatDate = () => {
    return new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Home Page
  if (view === 'home') {
    return (
      <div className="min-h-screen bg-amber-50 text-stone-800 relative overflow-hidden">
        <VintagePattern />
        
        {/* Decorative morse border */}
        <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-amber-900/10 to-transparent flex items-center justify-center overflow-hidden">
          <div className="text-amber-900/20 font-mono text-xs tracking-[0.5em] whitespace-nowrap animate-pulse">
            {morsePatterns.CQ} {morsePatterns.CQ} {morsePatterns.CQ} {morsePatterns.DE} {morsePatterns.K}
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
            <h1 className="font-serif text-6xl md:text-7xl font-bold tracking-tight text-amber-900 mb-2 drop-shadow-sm"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", textShadow: '2px 2px 4px rgba(120, 53, 15, 0.15)' }}>
              KNOW CODE
            </h1>
            <h2 className="font-serif text-4xl md:text-5xl font-light tracking-widest text-amber-700 mb-6"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", textShadow: '1px 1px 3px rgba(120, 53, 15, 0.1)' }}>
              EXTRA
            </h2>
            <div className="flex items-center justify-center gap-4 text-amber-800/70 mb-8">
              <span className="h-px w-16 bg-amber-800/40" />
              <span className="font-mono text-sm tracking-widest font-medium">EST. 1991</span>
              <span className="h-px w-16 bg-amber-800/40" />
            </div>
            <p className="font-serif text-xl text-amber-800 max-w-2xl mx-auto leading-relaxed italic"
               style={{ textShadow: '0 1px 2px rgba(255, 251, 235, 0.8)' }}>
              "Take the historic FCC Morse Code examinations and prove your proficiency with an authentic certificate"
            </p>
          </header>

          {/* Decorative divider */}
          <div className="flex items-center justify-center my-12">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-700" />
              <div className="w-4 h-1 bg-amber-700" />
              <div className="w-2 h-2 rounded-full bg-amber-700" />
              <div className="w-8 h-1 bg-amber-700" />
              <div className="w-2 h-2 rounded-full bg-amber-700" />
              <div className="w-4 h-1 bg-amber-700" />
              <div className="w-2 h-2 rounded-full bg-amber-700" />
            </div>
          </div>

          {/* Info cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {[
              { title: "AUTHENTIC TESTS", desc: "Original FCC examination audio from the ARRL archives, digitized for preservation" },
              { title: "HISTORIC STANDARD", desc: "Pass by copying 100 characters solid OR answering 7 of 10 questions correctly" },
              { title: "CERTIFICATES", desc: "Receive a commemorative certificate honoring the tradition of CW proficiency" }
            ].map((card, i) => (
              <div key={i} className="bg-white border-2 border-amber-300 p-6 text-center
                                      hover:border-amber-500 hover:bg-amber-50 transition-all duration-300
                                      shadow-lg hover:shadow-xl">
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
              onClick={() => setView('select')}
              className="group relative inline-flex items-center gap-3 bg-amber-900 text-amber-50 
                         px-12 py-5 font-mono text-lg tracking-widest
                         hover:bg-amber-800 transition-all duration-300
                         shadow-[4px_4px_0_0_rgba(120,53,15,0.4)]
                         hover:shadow-[6px_6px_0_0_rgba(120,53,15,0.5)]
                         hover:translate-x-[-2px] hover:translate-y-[-2px]"
            >
              <span>BEGIN EXAMINATION</span>
              <span className="text-amber-400 group-hover:translate-x-1 transition-transform">→</span>
            </button>
            <div>
              <button
                onClick={() => { fetchLeaderboard(); fetchStats(); setView('leaderboard'); }}
                className="font-mono text-sm text-amber-700 hover:text-amber-900 underline underline-offset-4"
              >
                VIEW LEADERBOARD
              </button>
            </div>
          </div>

          {/* Footer note */}
          <footer className="mt-16 text-center">
            <p className="font-mono text-xs text-amber-700 tracking-wide font-medium">
              TEST MATERIALS COURTESY OF WB4WXD & KB6NU • NOT FOR OFFICIAL FCC USE
            </p>
            <p className="font-mono text-xs text-amber-600/60 mt-2">
              −·−· ·−−· ·−·· ·−· ··−− ···−· ····− ···−−
            </p>
          </footer>
          
          </div> {/* End main content card */}
        </div>
      </div>
    );
  }

  // Test Selection Page
  if (view === 'select') {
    return (
      <div className="min-h-screen bg-amber-50 text-stone-800 relative">
        <VintagePattern />
        
        <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
          {/* Main content card */}
          <div className="bg-amber-50/95 backdrop-blur-sm shadow-2xl shadow-amber-900/10 border border-amber-200/50 px-8 py-10 md:px-12">
          
          <button 
            onClick={() => setView('home')}
            className="font-mono text-sm text-amber-700 hover:text-amber-900 mb-8 flex items-center gap-2 font-medium"
          >
            ← RETURN HOME
          </button>

          <h1 className="font-serif text-4xl font-bold text-amber-900 mb-2 text-center drop-shadow-sm"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", textShadow: '1px 1px 3px rgba(120, 53, 15, 0.1)' }}>
            Select Your Examination
          </h1>
          <p className="text-center text-amber-700 mb-12 font-serif italic">
            Choose the code speed for your proficiency test
          </p>

          {/* User Info */}
          <div className="bg-white border-2 border-amber-300 p-6 mb-8 max-w-md mx-auto shadow-md">
            <h3 className="font-mono text-sm tracking-widest text-amber-900 mb-4 text-center font-bold">APPLICANT INFORMATION</h3>
            <div>
              <label className="font-mono text-xs text-amber-700 block mb-1 font-medium">CALLSIGN</label>
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
                onClick={() => userCall.trim() ? handleStartTest(key) : alert('Please enter your callsign')}
                disabled={!userCall.trim()}
                className={`group bg-white border-2 border-amber-300 p-8 text-left
                           transition-all duration-300 relative overflow-hidden shadow-md
                           ${userCall.trim() 
                             ? 'hover:border-amber-500 hover:bg-amber-50 hover:shadow-xl cursor-pointer' 
                             : 'opacity-50 cursor-not-allowed'}`}
              >
                <div className="absolute top-0 right-0 w-24 h-24 -mr-12 -mt-12 bg-amber-100 
                               rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500" />
                
                <div className="relative">
                  <span className="font-mono text-xs tracking-widest text-amber-600 block mb-2 font-medium">
                    {test.year} EXAMINATION
                  </span>
                  <h3 className="font-serif text-3xl font-bold text-amber-900 mb-1">
                    {test.speed} WPM
                  </h3>
                  <p className="font-serif text-amber-700 mb-4">{test.title}</p>
                  
                  <div className="flex items-center gap-2 text-amber-600 font-mono text-sm font-medium
                                group-hover:text-amber-800 transition-colors">
                    <span>Start Test</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Historical note */}
          <div className="mt-12 p-6 bg-amber-100 border-l-4 border-amber-600 shadow-sm">
            <p className="font-serif text-amber-800 text-sm leading-relaxed">
              <strong>Historical Note:</strong> From 1936 until 2007, the FCC required amateur radio operators 
              to demonstrate Morse code proficiency. The 5 WPM test was required for Novice and Technician Plus, 
              13 WPM for General, and 20 WPM for Amateur Extra class licenses.
            </p>
          </div>
          
          </div> {/* End main content card */}
        </div>
      </div>
    );
  }

  // Test Page
  if (view === 'test') {
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
              onClick={() => setView('select')}
              className="font-mono text-sm text-amber-700 hover:text-amber-900 flex items-center gap-2 font-medium"
            >
              ← ABANDON TEST
            </button>
            <div className="text-right">
              <span className="font-mono text-sm text-amber-600 block font-medium">{test.title}</span>
              <span className="font-serif text-2xl font-bold text-amber-900">{test.speed} WPM</span>
            </div>
          </div>

          {/* Audio Player Section */}
          <div className="bg-gradient-to-br from-amber-900 to-amber-800 text-amber-50 p-8 mb-8 
                         shadow-xl border-4 border-amber-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-mono text-sm tracking-widest">CODE TRANSMISSION</h2>
              <TelegraphKey className="w-16 h-8 text-amber-300" />
            </div>
            
            <audio 
              ref={audioRef} 
              src={test.audioUrl}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onTimeUpdate={(e) => {
                const audio = e.target;
                setAudioProgress((audio.currentTime / audio.duration) * 100 || 0);
              }}
            />
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  if (audioRef.current) {
                    if (isPlaying) {
                      audioRef.current.pause();
                    } else {
                      audioRef.current.play();
                    }
                  }
                }}
                className="w-16 h-16 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center
                          hover:bg-white transition-colors shadow-lg text-2xl font-bold"
              >
                {isPlaying ? '❚❚' : '▶'}
              </button>
              
              <div className="flex-1">
                <div className="h-3 bg-amber-950 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-300 transition-all duration-100"
                    style={{ width: `${audioProgress}%` }}
                  />
                </div>
                <p className="font-mono text-xs text-amber-300 mt-2">
                  {isPlaying ? 'TRANSMITTING...' : 'READY TO TRANSMIT'}
                </p>
              </div>
            </div>
          </div>

          {/* Copy Area */}
          <div className="bg-white border-2 border-amber-300 p-6 mb-8 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-sm tracking-widest text-amber-900 font-bold">YOUR COPY</h3>
              <span className="font-mono text-sm text-amber-700 font-medium">
                {copyText.replace(/\s/g, '').length} / 100 characters
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
              Copy 100 characters (1 minute) solidly to pass, OR answer 7 of 10 questions correctly.
            </p>
          </div>

          {/* Questions */}
          <div className="bg-white border-2 border-amber-300 p-6 mb-8 shadow-md">
            <h3 className="font-mono text-sm tracking-widest text-amber-900 mb-6 font-bold">
              COMPREHENSION QUESTIONS
            </h3>
            
            <div className="space-y-6">
              {test.questions.map((q, qi) => (
                <div key={qi} className="border-b border-amber-200 pb-6 last:border-0">
                  <p className="font-serif text-amber-900 mb-3">
                    <span className="font-mono text-amber-600 mr-2 font-medium">{qi + 1}.</span>
                    {q.q}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {q.options.map((opt, oi) => (
                      <button
                        key={oi}
                        onClick={() => handleAnswer(qi, oi)}
                        className={`p-3 text-left font-serif text-sm border-2 transition-all
                                   ${answers[qi] === oi 
                                     ? 'border-amber-600 bg-amber-100 text-amber-900' 
                                     : 'border-amber-300 bg-amber-50 hover:border-amber-500 text-amber-800'}`}
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
          
          </div> {/* End main content card */}
        </div>
      </div>
    );
  }

  // Results Page
  if (view === 'results') {
    const test = testData[selectedTest];
    
    return (
      <div className="min-h-screen bg-amber-50 text-stone-800 relative">
        <VintagePattern />
        
        <div className="relative z-10 max-w-2xl mx-auto px-6 py-12">
          {/* Main content card */}
          <div className="bg-amber-50/95 backdrop-blur-sm shadow-2xl shadow-amber-900/10 border border-amber-200/50 p-4">
          
          <div className={`text-center p-12 border-4 ${passed ? 'border-green-600 bg-green-50' : 'border-red-600 bg-red-50'}`}>
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
            
            <h1 className="font-serif text-4xl font-bold mb-2"
                style={{ fontFamily: "'Playfair Display', Georgia, serif", color: passed ? '#166534' : '#dc2626' }}>
              {passed ? 'EXAMINATION PASSED' : 'EXAMINATION NOT PASSED'}
            </h1>
            
            <p className="font-serif text-lg text-amber-800 mb-8">
              {test.speed} WPM {test.title} Code Test
            </p>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="bg-white p-6 border-2 border-amber-300 shadow-sm">
                <p className="font-mono text-xs text-amber-600 mb-1 font-medium">QUESTIONS</p>
                <p className="font-serif text-3xl font-bold text-amber-900">
                  {score.correct} / {score.total}
                </p>
                <p className="font-mono text-xs text-amber-600 mt-1 font-medium">
                  {score.correct >= 7 ? '✓ PASSED' : '✗ Need 7+'}
                </p>
              </div>
              <div className="bg-white p-6 border-2 border-amber-300 shadow-sm">
                <p className="font-mono text-xs text-amber-600 mb-1 font-medium">COPY</p>
                <p className="font-serif text-3xl font-bold text-amber-900">
                  {score.copyChars} chars
                </p>
                <p className="font-mono text-xs text-amber-600 mt-1 font-medium">
                  {score.copyChars >= 100 ? '✓ PASSED' : '✗ Need 100+'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {passed && (
                <button
                  onClick={() => setView('certificate')}
                  className="bg-amber-900 text-amber-50 px-8 py-4 font-mono tracking-widest
                            hover:bg-amber-800 transition-all shadow-lg"
                >
                  VIEW CERTIFICATE
                </button>
              )}
              <button
                onClick={() => setView('select')}
                className="bg-white text-amber-900 px-8 py-4 font-mono tracking-widest
                          border-2 border-amber-300 hover:border-amber-500 transition-all"
              >
                {passed ? 'TRY ANOTHER SPEED' : 'TRY AGAIN'}
              </button>
            </div>
          </div>
          
          </div> {/* End main content card */}
        </div>
      </div>
    );
  }

  // Certificate Page
  if (view === 'certificate') {
    const test = testData[selectedTest];
    
    return (
      <div className="min-h-screen bg-stone-800 py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <button
              onClick={() => setView('select')}
              className="font-mono text-sm text-stone-400 hover:text-stone-200 mb-4"
            >
              ← Take Another Test
            </button>
            <p className="font-mono text-xs text-stone-500">Right-click or long-press to save your certificate</p>
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
                <h1 className="font-serif text-4xl md:text-5xl font-bold text-amber-900 tracking-wide mb-2"
                    style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
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
                  has successfully demonstrated proficiency in the reception of<br/>
                  International Morse Code at a speed of
                </p>
                <p className="font-serif text-5xl font-bold text-amber-900"
                   style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  {test.speed} WPM
                </p>
                <p className="font-mono text-sm tracking-widest text-amber-600 mt-2">
                  {test.title.toUpperCase()} EXAMINATION
                </p>
              </div>

              {/* Footer */}
              <div className="flex justify-between items-end mt-12 pt-8 border-t border-amber-200">
                <div className="text-center">
                  <p className="font-mono text-xs text-amber-600 mb-1">DATE ISSUED</p>
                  <p className="font-serif text-amber-900">{formatDate()}</p>
                </div>
                <div className="text-center">
                  <div className="w-32 h-16 border-2 border-amber-300 flex items-center justify-center mb-1">
                    <span className="font-mono text-xs text-amber-400">SEAL</span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="font-mono text-xs text-amber-600 mb-1">CERTIFICATE NO.</p>
                  <p className="font-mono text-amber-900 text-sm">
                    {certificateNumber || `${selectedTest.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`}
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
  if (view === 'leaderboard') {
    return (
      <div className="min-h-screen bg-amber-50 text-stone-800 relative">
        <VintagePattern />
        
        <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
          <div className="bg-amber-50/95 backdrop-blur-sm shadow-2xl shadow-amber-900/10 border border-amber-200/50 px-8 py-10 md:px-12">
          
          <button 
            onClick={() => setView('home')}
            className="font-mono text-sm text-amber-700 hover:text-amber-900 mb-8 flex items-center gap-2 font-medium"
          >
            ← RETURN HOME
          </button>

          <h1 className="font-serif text-4xl font-bold text-amber-900 mb-2 text-center drop-shadow-sm"
              style={{ fontFamily: "'Playfair Display', Georgia, serif", textShadow: '1px 1px 3px rgba(120, 53, 15, 0.1)' }}>
            Honor Roll
          </h1>
          <p className="text-center text-amber-700 mb-8 font-serif italic">
            Operators who have demonstrated CW proficiency
          </p>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white border-2 border-amber-300 p-4 text-center shadow-sm">
                <p className="font-mono text-xs text-amber-600 mb-1">TOTAL ATTEMPTS</p>
                <p className="font-serif text-2xl font-bold text-amber-900">{stats.total_attempts}</p>
              </div>
              <div className="bg-white border-2 border-amber-300 p-4 text-center shadow-sm">
                <p className="font-mono text-xs text-amber-600 mb-1">PASSES</p>
                <p className="font-serif text-2xl font-bold text-amber-900">{stats.total_passes}</p>
              </div>
              <div className="bg-white border-2 border-amber-300 p-4 text-center shadow-sm">
                <p className="font-mono text-xs text-amber-600 mb-1">OPERATORS</p>
                <p className="font-serif text-2xl font-bold text-amber-900">{stats.unique_callsigns}</p>
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
                  <div key={entry.callsign} className={`px-6 py-4 ${index < 3 ? 'bg-amber-50' : ''}`}>
                    <div className="grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-1 font-mono text-amber-600 font-bold">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
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
              onClick={() => setView('select')}
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

  return null;
}

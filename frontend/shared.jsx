import React from "react";

// Morse code for decorative elements
export const morsePatterns = {
  BT: "−··· −",
  CQ: "−·−· −−·−",
  DE: "−·· ·",
  K: "−·−",
  AR: "·−·−·",
  SK: "···−·−",
};

// Get segment color based on name
export const getSegmentColor = (name) => {
  const colors = {
    'intro': 'bg-amber-600', 'outro': 'bg-amber-600',
    'practice': 'bg-amber-500', 'copy': 'bg-amber-500',
    'instructions': 'bg-amber-400', 'notes': 'bg-amber-400',
    'test': 'bg-green-600',
  };
  return colors[name.toLowerCase()] || 'bg-gray-500';
};

// Vintage-style background pattern component
export const VintagePattern = () => (
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
export const TelegraphKey = ({ className = "" }) => (
  <svg viewBox="0 0 120 60" className={className} fill="currentColor">
    <ellipse cx="60" cy="50" rx="55" ry="8" opacity="0.3" />
    <rect x="20" y="35" width="80" height="12" rx="2" />
    <rect x="55" y="20" width="10" height="20" rx="1" />
    <circle cx="60" cy="15" r="8" />
    <rect x="10" y="42" width="100" height="4" rx="2" opacity="0.5" />
  </svg>
);

// Confirmation Modal component
export const ConfirmModal = ({
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

// API Configuration - empty string means same-origin requests
export const API_BASE = "";

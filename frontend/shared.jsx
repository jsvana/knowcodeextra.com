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
  <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
    <pattern id="telegraph" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="currentColor" />
    </pattern>
    <rect width="100%" height="100%" fill="url(#telegraph)" />
  </svg>
);

// Telegraph key decorative element
export const TelegraphKey = ({ className = "" }) => (
  <svg className={className} viewBox="0 0 100 50" fill="currentColor">
    <rect x="10" y="35" width="80" height="10" rx="2" />
    <rect x="40" y="20" width="20" height="20" rx="2" />
    <circle cx="50" cy="15" r="8" />
  </svg>
);

// Confirmation Modal component
export const ConfirmModal = ({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  confirmStyle = "danger",
}) => {
  if (!isOpen) return null;

  const confirmButtonStyles = {
    danger: "bg-red-700 hover:bg-red-600 text-white",
    success: "bg-green-700 hover:bg-green-600 text-white",
    warning: "bg-amber-600 hover:bg-amber-500 text-white",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-amber-50 border-4 border-amber-800 p-6 max-w-md mx-4">
        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-amber-900" />
        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-amber-900" />
        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-amber-900" />
        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-amber-900" />

        <h3 className="font-serif text-xl text-amber-900 mb-4">{title}</h3>
        <p className="font-mono text-sm text-amber-800 mb-6">{message}</p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 font-mono text-sm border-2 border-amber-300 text-amber-800 hover:border-amber-500 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 font-mono text-sm transition-colors ${confirmButtonStyles[confirmStyle]}`}
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

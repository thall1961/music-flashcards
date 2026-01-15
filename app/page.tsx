"use client";

import { useState } from "react";

// Note data with name and vertical position on the treble clef staff
// Position is measured from the bottom line (E4), each step is half a line/space
const notes = [
  { name: "G", position: -2 }, // Middle C - one ledger line below staff
  { name: "A", position: -1 }, // Below bottom line
  { name: "B", position: 0 },  // Bottom line (E4)
  { name: "C", position: 1 },  // First space
  { name: "D", position: 2 },  // Second line
  { name: "E", position: 3 },  // Second space
  { name: "F", position: 4 },  // Third line (middle line)
];

// SVG component that renders a note on a treble clef staff
function TrebleClefNote({ position }: { position: number }) {
  const staffLineSpacing = 20;
  const staffTop = 60;
  const noteY = staffTop + (4 - position) * (staffLineSpacing / 2);

  return (
    <svg viewBox="0 0 200 200" className="w-full h-full">
      {/* Staff lines */}
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1="30"
          y1={staffTop + i * staffLineSpacing}
          x2="170"
          y2={staffTop + i * staffLineSpacing}
          stroke="currentColor"
          strokeWidth="1.5"
        />
      ))}

      {/* Treble clef symbol - curl should sit on G line (second from bottom) */}
      <text
        x="20"
        y={staffTop + 4.6 * staffLineSpacing}
        fontSize="165"
        fontFamily="serif"
        fill="currentColor"
      >
        𝄞
      </text>

      {/* Ledger line for middle C */}
      {position <= -2 && (
        <line
          x1="115"
          y1={staffTop + 5 * staffLineSpacing}
          x2="155"
          y2={staffTop + 5 * staffLineSpacing}
          stroke="currentColor"
          strokeWidth="1.5"
        />
      )}

      {/* Note (filled oval) */}
      <ellipse
        cx="135"
        cy={noteY}
        rx="12"
        ry="9"
        fill="currentColor"
        transform={`rotate(-15, 135, ${noteY})`}
      />
    </svg>
  );
}

export default function Home() {
  const [currentNoteIndex, setCurrentNoteIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const currentNote = notes[currentNoteIndex];

  const nextNote = () => {
    setIsFlipped(false);
    setCurrentNoteIndex((prev) => (prev + 1) % notes.length);
  };

  const prevNote = () => {
    setIsFlipped(false);
    setCurrentNoteIndex((prev) => (prev - 1 + notes.length) % notes.length);
  };

  const flipCard = () => {
    setIsFlipped(!isFlipped);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50 p-8 dark:from-zinc-900 dark:to-zinc-800">
      <h1 className="mb-8 text-3xl font-bold text-zinc-800 dark:text-zinc-100">
        Music Note Flashcards
      </h1>

      {/* Flashcard */}
      <div
        className="relative h-80 w-64 cursor-pointer perspective-1000"
        onClick={flipCard}
      >
        <div
          className={`relative h-full w-full transition-transform duration-500 transform-style-preserve-3d ${
            isFlipped ? "rotate-y-180" : ""
          }`}
        >
          {/* Front - Note on staff */}
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white shadow-xl backface-hidden dark:bg-zinc-700">
            <div className="h-48 w-48 text-zinc-800 dark:text-zinc-100">
              <TrebleClefNote position={currentNote.position} />
            </div>
          </div>

          {/* Back - Letter name */}
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-indigo-500 shadow-xl backface-hidden rotate-y-180">
            <span className="text-9xl font-bold text-white">
              {currentNote.name}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
        Click the card to flip
      </p>

      {/* Navigation */}
      <div className="mt-8 flex gap-4">
        <button
          onClick={prevNote}
          className="rounded-full bg-zinc-200 px-6 py-3 font-medium text-zinc-700 transition-colors hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-500"
        >
          ← Previous
        </button>
        <button
          onClick={nextNote}
          className="rounded-full bg-indigo-500 px-6 py-3 font-medium text-white transition-colors hover:bg-indigo-600"
        >
          Next →
        </button>
      </div>

      {/* Progress indicator */}
      <div className="mt-6 flex gap-2">
        {notes.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              setIsFlipped(false);
              setCurrentNoteIndex(index);
            }}
            className={`h-3 w-3 rounded-full transition-colors ${
              index === currentNoteIndex
                ? "bg-indigo-500"
                : "bg-zinc-300 hover:bg-zinc-400 dark:bg-zinc-600 dark:hover:bg-zinc-500"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback, useMemo } from "react";
import { vocabulary, categories, type Flashcard } from "./data/vocabulary";

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function Home() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffledCards, setShuffledCards] = useState<Flashcard[]>([]);

  const filteredCards = useMemo(
    () =>
      selectedCategory === "All"
        ? vocabulary
        : vocabulary.filter((card) => card.category === selectedCategory),
    [selectedCategory]
  );

  const cards = isShuffled ? shuffledCards : filteredCards;
  const currentCard = cards[currentIndex];
  const isVerbCard = currentCard?.back.includes("\n");

  const handleShuffle = useCallback(() => {
    const newShuffled = shuffleArray(filteredCards);
    setShuffledCards(newShuffled);
    setIsShuffled(true);
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [filteredCards]);

  const handleReset = useCallback(() => {
    setIsShuffled(false);
    setCurrentIndex(0);
    setIsFlipped(false);
  }, []);

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsShuffled(false);
  };

  const nextCard = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % cards.length);
  };

  const prevCard = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
  };

  const flipCard = () => {
    setIsFlipped(!isFlipped);
  };

  if (!currentCard) return null;

  // Parse verb conjugation for structured rendering
  const parseBack = (text: string) => {
    const lines = text.split("\n").filter((l) => l !== "");
    if (lines.length <= 1) return null;
    const infinitive = lines[0];
    const subtitle = lines[1]?.startsWith("(") ? lines[1] : null;
    const conjugations = subtitle ? lines.slice(2) : lines.slice(1);
    return { infinitive, subtitle, conjugations };
  };

  const verbData = isVerbCard ? parseBack(currentCard.back) : null;

  return (
    <div className="flex min-h-screen flex-col items-center bg-gradient-to-br from-emerald-50 to-sky-50 px-4 py-8 dark:from-zinc-900 dark:to-zinc-800">
      <h1 className="mb-4 text-3xl font-bold text-zinc-800 dark:text-zinc-100">
        Italian Flashcards
      </h1>

      {/* Category selector */}
      <div className="mb-6 w-full max-w-2xl overflow-x-auto">
        <div className="flex gap-2 pb-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-emerald-500 text-white"
                  : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-500"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Card count */}
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        Card {currentIndex + 1} of {cards.length}
        {selectedCategory !== "All" && (
          <span className="ml-2 rounded bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-600">
            {selectedCategory}
          </span>
        )}
      </p>

      {/* Flashcard */}
      <div
        className={`relative w-80 cursor-pointer perspective-1000 ${
          isVerbCard ? "h-[420px]" : "h-72"
        }`}
        onClick={flipCard}
      >
        <div
          className={`relative h-full w-full transition-transform duration-500 transform-style-preserve-3d ${
            isFlipped ? "rotate-y-180" : ""
          }`}
        >
          {/* Front - English */}
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white p-6 shadow-xl backface-hidden dark:bg-zinc-700">
            <span className="text-center text-3xl font-bold text-zinc-800 dark:text-zinc-100">
              {currentCard.front}
            </span>
            <span className="mt-4 text-xs uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {currentCard.category}
            </span>
          </div>

          {/* Back - Italian */}
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-emerald-500 p-6 shadow-xl backface-hidden rotate-y-180">
            {verbData ? (
              <>
                <span className="mb-1 text-2xl font-bold text-white">
                  {verbData.infinitive}
                </span>
                {verbData.subtitle && (
                  <span className="mb-3 text-sm italic text-emerald-100">
                    {verbData.subtitle}
                  </span>
                )}
                <div className="w-full space-y-1">
                  {verbData.conjugations.map((line, i) => (
                    <div
                      key={i}
                      className="text-center text-base text-white"
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <span className="text-center text-5xl font-bold text-white">
                {currentCard.back}
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
        Click the card to flip
      </p>

      {/* Navigation */}
      <div className="mt-6 flex gap-4">
        <button
          onClick={prevCard}
          className="rounded-full bg-zinc-200 px-6 py-3 font-medium text-zinc-700 transition-colors hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-500"
        >
          &larr; Previous
        </button>
        <button
          onClick={nextCard}
          className="rounded-full bg-emerald-500 px-6 py-3 font-medium text-white transition-colors hover:bg-emerald-600"
        >
          Next &rarr;
        </button>
      </div>

      {/* Shuffle / Reset */}
      <div className="mt-4 flex gap-3">
        <button
          onClick={handleShuffle}
          className="rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600"
        >
          Shuffle
        </button>
        {isShuffled && (
          <button
            onClick={handleReset}
            className="rounded-full bg-zinc-200 px-5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-500"
          >
            Reset Order
          </button>
        )}
      </div>
    </div>
  );
}

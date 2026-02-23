"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
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

// --- Confidence tracking ---
type MissRecord = { missCount: number; gotItSinceMiss: number };
type MissMap = Record<string, MissRecord>;

const STORAGE_KEY = "flashcard-misses";

function cardKey(card: Flashcard): string {
  return card.front;
}

function loadMisses(): MissMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMisses(misses: MissMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(misses));
}

export default function Home() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffledCards, setShuffledCards] = useState<Flashcard[]>([]);
  const [misses, setMisses] = useState<MissMap>({});
  const [reviewMode, setReviewMode] = useState(false);

  // AI sentence validator state
  const [aiMode, setAiMode] = useState<"validate" | "prompt" | "converse">("validate");
  const [sentenceInput, setSentenceInput] = useState("");
  const [aiResult, setAiResult] = useState<{
    result: "correct" | "close" | "wrong";
    explanation?: string;
  } | null>(null);
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Converse mode state
  const [isListening, setIsListening] = useState(false);
  const [converseReply, setConverseReply] = useState<string | null>(null);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);

  // Check for speech recognition support
  useEffect(() => {
    setHasSpeechSupport(
      typeof window !== "undefined" &&
        ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)
    );
  }, []);

  // Load misses from localStorage on mount
  useEffect(() => {
    setMisses(loadMisses());
  }, []);

  const filteredCards = useMemo(
    () =>
      selectedCategory === "All"
        ? vocabulary
        : vocabulary.filter((card) => card.category === selectedCategory),
    [selectedCategory]
  );

  // Cards that are still in the misses deck (gotItSinceMiss < 2)
  const missedCards = useMemo(
    () =>
      vocabulary.filter((card) => {
        const rec = misses[cardKey(card)];
        return rec && rec.gotItSinceMiss < 2;
      }),
    [misses]
  );

  const missCount = missedCards.length;

  const baseCards = reviewMode ? missedCards : filteredCards;
  const cards = isShuffled ? shuffledCards : baseCards;
  const currentCard = cards[currentIndex];
  const isVerbCard = currentCard?.back.includes("\n");

  // Extract the primary Italian word from the card back
  const extractItalianWord = (back: string): string => {
    // For verbs: first line is the infinitive
    if (back.includes("\n")) return back.split("\n")[0];
    // For slash-separated alternatives: take the first one
    if (back.includes(" / ")) return back.split(" / ")[0];
    return back;
  };

  const resetAiState = useCallback(() => {
    setSentenceInput("");
    setAiResult(null);
    setAiPrompt(null);
    setAiLoading(false);
    setAiError(null);
    setConverseReply(null);
    window.speechSynthesis.cancel();
  }, []);

  const handleAiSubmit = async () => {
    if (!currentCard) return;
    const italianWord = extractItalianWord(currentCard.back);

    // In prompt mode without a sentence, generate a prompt
    if (aiMode === "prompt" && !sentenceInput.trim() && !aiPrompt) {
      setAiLoading(true);
      setAiError(null);
      try {
        const res = await fetch("/api/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "prompt",
            italianWord,
            englishWord: currentCard.front,
            category: currentCard.category,
            isVerb: isVerbCard,
          }),
        });
        const data = await res.json();
        if (data.prompt) setAiPrompt(data.prompt);
      } catch {
        setAiError("Failed to generate prompt. Check your API key.");
      } finally {
        setAiLoading(false);
      }
      return;
    }

    // Validate the sentence
    if (!sentenceInput.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: aiMode,
          italianWord,
          englishWord: currentCard.front,
          sentence: sentenceInput.trim(),
          aiPrompt,
          category: currentCard.category,
          isVerb: isVerbCard,
        }),
      });
      const data = await res.json();
      if (data.result) {
        setAiResult({ result: data.result, explanation: data.explanation });
      }
    } catch {
      setAiError("Failed to validate. Check your API key.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleConverse = async (transcript: string) => {
    if (!currentCard || !transcript.trim()) return;
    const italianWord = extractItalianWord(currentCard.back);

    setAiLoading(true);
    setAiError(null);
    setConverseReply(null);
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "converse",
          italianWord,
          englishWord: currentCard.front,
          sentence: transcript.trim(),
          category: currentCard.category,
          isVerb: isVerbCard,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setConverseReply(data.reply);
        speakItalian(data.reply);
      }
    } catch {
      setAiError("Failed to get response. Check your API key.");
    } finally {
      setAiLoading(false);
    }
  };

  const startListening = (autoSubmit: boolean) => {
    if (!hasSpeechSupport) return;

    const SpeechRecognition =
      (window as /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ any).webkitSpeechRecognition ||
      (window as /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "it-IT";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: { results: { transcript: string }[][] }) => {
      const transcript = event.results[0][0].transcript;
      setSentenceInput(transcript);
      setIsListening(false);
      if (autoSubmit) {
        handleConverse(transcript);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    setIsListening(true);
    recognition.start();
  };

  const markGotIt = () => {
    if (!currentCard) return;
    const key = cardKey(currentCard);
    const updated = { ...misses };
    if (updated[key]) {
      updated[key] = {
        ...updated[key],
        gotItSinceMiss: updated[key].gotItSinceMiss + 1,
      };
      // If they've gotten it right twice, remove from map entirely
      if (updated[key].gotItSinceMiss >= 2) {
        delete updated[key];
      }
    }
    setMisses(updated);
    saveMisses(updated);
    advanceAfterMark(updated);
  };

  const markMissed = () => {
    if (!currentCard) return;
    const key = cardKey(currentCard);
    const updated = { ...misses };
    const existing = updated[key];
    updated[key] = {
      missCount: (existing?.missCount ?? 0) + 1,
      gotItSinceMiss: 0, // reset streak on a miss
    };
    setMisses(updated);
    saveMisses(updated);
    advanceAfterMark(updated);
  };

  // After marking, advance to next card (handle review mode deck shrinking)
  const advanceAfterMark = (updatedMisses: MissMap) => {
    resetAiState();
    if (reviewMode) {
      const remaining = vocabulary.filter((card) => {
        const rec = updatedMisses[cardKey(card)];
        return rec && rec.gotItSinceMiss < 2;
      });
      if (remaining.length === 0) {
        setReviewMode(false);
        setCurrentIndex(0);
        setIsFlipped(false);
        return;
      }
      setCurrentIndex((prev) =>
        prev >= remaining.length ? 0 : prev
      );
    } else {
      setCurrentIndex((prev) => (prev + 1) % cards.length);
    }
    setIsFlipped(false);
  };

  const handleShuffle = useCallback(() => {
    const newShuffled = shuffleArray(baseCards);
    setShuffledCards(newShuffled);
    setIsShuffled(true);
    setCurrentIndex(0);
    setIsFlipped(false);
    resetAiState();
  }, [baseCards, resetAiState]);

  const handleReset = useCallback(() => {
    setIsShuffled(false);
    setCurrentIndex(0);
    setIsFlipped(false);
    resetAiState();
  }, [resetAiState]);

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setReviewMode(false);
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsShuffled(false);
    resetAiState();
  };

  const enterReviewMode = () => {
    if (missedCards.length === 0) return;
    setReviewMode(true);
    setSelectedCategory("All");
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsShuffled(false);
    resetAiState();
  };

  const nextCard = () => {
    setIsFlipped(false);
    resetAiState();
    setCurrentIndex((prev) => (prev + 1) % cards.length);
  };

  const prevCard = () => {
    setIsFlipped(false);
    resetAiState();
    setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
  };

  const speakItalian = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "it-IT";
    window.speechSynthesis.speak(utterance);
  };

  const flipCard = () => {
    setIsFlipped(!isFlipped);
    resetAiState();
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

      {/* Review Misses button */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={enterReviewMode}
          disabled={missCount === 0}
          className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
            reviewMode
              ? "bg-rose-500 text-white"
              : missCount > 0
                ? "bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
                : "cursor-default bg-zinc-100 text-zinc-400 dark:bg-zinc-700 dark:text-zinc-500"
          }`}
        >
          Review Misses
          {missCount > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white">
              {missCount}
            </span>
          )}
        </button>
        {reviewMode && (
          <button
            onClick={() => {
              setReviewMode(false);
              setCurrentIndex(0);
              setIsFlipped(false);
              setIsShuffled(false);
            }}
            className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Exit review
          </button>
        )}
      </div>

      {/* Card count */}
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        Card {currentIndex + 1} of {cards.length}
        {reviewMode ? (
          <span className="ml-2 rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
            Review Misses
          </span>
        ) : (
          selectedCategory !== "All" && (
            <span className="ml-2 rounded bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-600">
              {selectedCategory}
            </span>
          )
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

      {/* AI Sentence Practice */}
      {isFlipped && (
        <div className="mt-4 w-80 space-y-3">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setAiMode("validate");
                setAiPrompt(null);
                setAiResult(null);
                setAiError(null);
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                aiMode === "validate"
                  ? "bg-sky-500 text-white"
                  : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-500"
              }`}
            >
              Practice
            </button>
            <button
              onClick={() => {
                setAiMode("prompt");
                setAiResult(null);
                setAiError(null);
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                aiMode === "prompt"
                  ? "bg-violet-500 text-white"
                  : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-500"
              }`}
            >
              Prompt Me
            </button>
            {hasSpeechSupport && (
              <button
                onClick={() => {
                  setAiMode("converse");
                  setAiResult(null);
                  setAiError(null);
                  setAiPrompt(null);
                  setConverseReply(null);
                }}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                  aiMode === "converse"
                    ? "bg-teal-500 text-white"
                    : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-500"
                }`}
              >
                Converse
              </button>
            )}
          </div>

          {/* Converse mode UI */}
          {aiMode === "converse" && (
            <div className="flex flex-col items-center gap-3">
              {/* Mic button */}
              <button
                onClick={() => startListening(true)}
                disabled={isListening || aiLoading}
                className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl transition-all ${
                  isListening
                    ? "animate-pulse bg-teal-500 text-white shadow-lg shadow-teal-500/50"
                    : aiLoading
                      ? "bg-zinc-300 text-zinc-500 dark:bg-zinc-600 dark:text-zinc-400"
                      : "bg-teal-500 text-white hover:bg-teal-600 active:scale-95"
                }`}
                title={isListening ? "Listening..." : "Tap to speak Italian"}
              >
                🎤
              </button>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {isListening
                  ? "Listening... speak now"
                  : aiLoading
                    ? "Getting response..."
                    : "Tap to speak Italian"}
              </p>

              {/* Transcribed text */}
              {sentenceInput && (
                <div className="w-full rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">You said: </span>
                  {sentenceInput}
                </div>
              )}

              {/* Claude's reply */}
              {converseReply && (
                <div className="w-full rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800 dark:bg-teal-900/30 dark:text-teal-200">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-teal-600 dark:text-teal-400">Claude:</span>
                    <button
                      type="button"
                      onClick={() => speakItalian(converseReply)}
                      className="text-lg opacity-60 transition-opacity hover:opacity-100"
                      title="Replay response"
                    >
                      🔊
                    </button>
                  </div>
                  {converseReply}
                </div>
              )}
            </div>
          )}

          {/* Generate prompt button (prompt mode, before prompt generated) */}
          {aiMode === "prompt" && !aiPrompt && (
            <button
              onClick={handleAiSubmit}
              disabled={aiLoading}
              className="w-full rounded-lg bg-violet-100 px-4 py-2 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-200 disabled:opacity-50 dark:bg-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-900/60"
            >
              {aiLoading ? "Generating..." : "Generate a prompt"}
            </button>
          )}

          {/* Generated prompt display */}
          {aiPrompt && (
            <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm italic text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
              {aiPrompt}
            </p>
          )}

          {/* Input + submit (show in validate mode always, or in prompt mode after prompt generated) */}
          {(aiMode === "validate" || aiPrompt) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAiSubmit();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={sentenceInput}
                onChange={(e) => setSentenceInput(e.target.value)}
                placeholder="Type an Italian sentence..."
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-sky-500"
              />
              {hasSpeechSupport && (
                <button
                  type="button"
                  onClick={() => startListening(false)}
                  disabled={isListening}
                  className={`shrink-0 rounded-lg px-2 py-2 text-lg transition-colors ${
                    isListening
                      ? "animate-pulse bg-teal-500 text-white"
                      : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-500"
                  }`}
                  title={isListening ? "Listening..." : "Speak to fill input"}
                >
                  🎤
                </button>
              )}
              <button
                type="submit"
                disabled={aiLoading || !sentenceInput.trim()}
                className="shrink-0 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:opacity-50"
              >
                {aiLoading ? "..." : "Check"}
              </button>
            </form>
          )}

          {/* Result display */}
          {aiResult && (
            <div
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                aiResult.result === "correct"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : aiResult.result === "close"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
              }`}
            >
              <span className="shrink-0 text-lg leading-tight">
                {aiResult.result === "correct"
                  ? "\u2713"
                  : aiResult.result === "close"
                    ? "\u26A0"
                    : "\u2717"}
              </span>
              <span className="flex-1">
                {aiResult.result === "correct"
                  ? "Correct!"
                  : aiResult.explanation}
              </span>
              {sentenceInput.trim() && (
                <button
                  type="button"
                  onClick={() => speakItalian(sentenceInput.trim())}
                  className="shrink-0 text-lg leading-tight opacity-60 transition-opacity hover:opacity-100"
                  title="Read aloud in Italian"
                >
                  🔊
                </button>
              )}
            </div>
          )}

          {/* Error display */}
          {aiError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
              {aiError}
            </p>
          )}
        </div>
      )}

      {/* Got it / Missed it buttons */}
      {isFlipped ? (
        <div className="mt-4 flex gap-3">
          <button
            onClick={markGotIt}
            className="rounded-full bg-emerald-100 px-5 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
          >
            Got it
          </button>
          <button
            onClick={markMissed}
            className="rounded-full bg-rose-100 px-5 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
          >
            Missed it
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Click the card to flip
        </p>
      )}

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

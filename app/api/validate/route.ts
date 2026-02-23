import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const { mode, italianWord, englishWord, sentence, aiPrompt, category, isVerb } =
    await req.json();

  // Mode: "converse" → conversational Italian tutor
  if (mode === "converse") {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `You are a friendly Italian conversation partner. The student is practicing the ${
            isVerb ? "verb" : "word"
          } "${italianWord}" (English: "${englishWord}", category: ${category}).

The student said: "${sentence}"

Reply naturally IN ITALIAN (1-2 sentences), continuing the conversation and staying on-topic with the word being practiced. After your Italian reply, add a brief English note in parentheses if it helps clarify meaning.

Keep it simple and conversational — B1 level or below.`,
        },
      ],
    });

    const text =
      msg.content[0].type === "text" ? msg.content[0].text : "";

    return NextResponse.json({ reply: text.trim() });
  }

  // Mode: "prompt" without sentence → generate a practice prompt
  if (mode === "prompt" && !sentence) {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `You are an Italian language tutor. The student is studying the ${
            isVerb ? "verb" : "word"
          } "${italianWord}" (English: "${englishWord}", category: ${category}).

Give them a short, specific prompt telling them what Italian sentence to write using this word. Keep it to one sentence. Example format: "Use '${italianWord}' to say that you like going to the park."

Do NOT write the Italian sentence for them. Just describe what they should write.`,
        },
      ],
    });

    const text =
      msg.content[0].type === "text" ? msg.content[0].text : "";

    return NextResponse.json({ prompt: text.trim() });
  }

  // Mode: "validate" or "prompt" with sentence → validate the sentence
  const promptContext = aiPrompt
    ? `The student was asked: "${aiPrompt}"\n`
    : "";

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [
      {
        role: "user",
        content: `You are an Italian language tutor. The student is practicing the ${
          isVerb ? "verb" : "word"
        } "${italianWord}" (English: "${englishWord}", category: ${category}).
${promptContext}
The student wrote: "${sentence}"

Evaluate their Italian sentence. Respond with EXACTLY one of these formats:
- CORRECT (if the sentence is grammatically correct and uses the word properly)
- CLOSE: brief explanation (if there's a small mistake like wrong conjugation, gender, or article)
- WRONG: brief explanation (if the sentence is nonsensical, doesn't use the word, or has major errors)

Keep explanations under 15 words.`,
      },
    ],
  });

  const text =
    msg.content[0].type === "text" ? msg.content[0].text : "";
  const trimmed = text.trim();

  if (trimmed === "CORRECT" || trimmed.startsWith("CORRECT")) {
    return NextResponse.json({ result: "correct" });
  } else if (trimmed.startsWith("CLOSE:")) {
    return NextResponse.json({
      result: "close",
      explanation: trimmed.slice(6).trim(),
    });
  } else if (trimmed.startsWith("WRONG:")) {
    return NextResponse.json({
      result: "wrong",
      explanation: trimmed.slice(6).trim(),
    });
  }

  // Fallback: try to interpret
  const lower = trimmed.toLowerCase();
  if (lower.includes("correct")) {
    return NextResponse.json({ result: "correct" });
  } else if (lower.includes("close")) {
    return NextResponse.json({
      result: "close",
      explanation: trimmed,
    });
  } else {
    return NextResponse.json({
      result: "wrong",
      explanation: trimmed,
    });
  }
}

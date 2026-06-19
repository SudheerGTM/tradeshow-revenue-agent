/**
 * AI provider abstraction for Conversation Intelligence.
 * Currently supports Gemini. Bedrock can be added later by switching AI_PROVIDER.
 * All AI calls are server-side only — keys never reach the browser.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ConversationContext {
  leadName: string;
  companyName: string;
  eventName?: string;
  jobTitle?: string;
}

export interface AnalysisResult {
  pain_points: string[];
  product_interest: string[];
  business_need: string;
  urgency: "low" | "medium" | "high" | "unknown";
  timeline: string;
  budget_signal: string;
  decision_maker_signal: string;
  competitor_mentioned: string;
  next_best_action: string;
  summary: string;
  recommended_follow_up: string;
  confidence_score: number;
  needs_human_review: boolean;
}

const SYSTEM_PROMPT = `You are a trade show sales intelligence agent. You analyze conversation transcripts and notes from trade show booth interactions and extract structured sales intelligence.

You must return ONLY valid JSON matching this exact schema — no markdown, no explanation, no code fences:

{
  "pain_points": ["string array of pain points mentioned"],
  "product_interest": ["string array of products or features the lead showed interest in"],
  "business_need": "one sentence describing the core business need",
  "urgency": "low | medium | high | unknown",
  "timeline": "when they need a solution, or empty string",
  "budget_signal": "any budget hints mentioned, or empty string",
  "decision_maker_signal": "are they a decision maker? any signals, or empty string",
  "competitor_mentioned": "any competitors mentioned, or empty string",
  "next_best_action": "single most important next action for the sales rep",
  "summary": "2-3 sentence executive summary of the conversation",
  "recommended_follow_up": "specific recommended follow-up message or action",
  "confidence_score": 0-100,
  "needs_human_review": true|false
}

Rules:
- confidence_score below 70 means needs_human_review must be true
- If the input is too short or vague, set confidence_score below 50
- urgency must be exactly one of: low, medium, high, unknown
- pain_points and product_interest must be arrays (can be empty)
- Do not invent information not present in the input
- Do not suggest sending emails or creating deals`;

export async function analyzeConversation(
  inputText: string,
  context: ConversationContext
): Promise<{ result: AnalysisResult; modelUsed: string; rawResponse: unknown }> {
  const provider = process.env.AI_PROVIDER ?? "gemini";

  if (provider === "gemini") {
    return analyzeWithGemini(inputText, context);
  }

  throw new Error(`Unsupported AI provider: ${provider}. Set AI_PROVIDER=gemini in .env.local`);
}

async function analyzeWithGemini(
  inputText: string,
  context: ConversationContext
): Promise<{ result: AnalysisResult; modelUsed: string; rawResponse: unknown }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const modelName = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" },
  });

  const userPrompt = `Analyze this trade show conversation.

Lead: ${context.leadName}
Company: ${context.companyName}
${context.jobTitle ? `Job Title: ${context.jobTitle}` : ""}
${context.eventName ? `Event: ${context.eventName}` : ""}

Conversation transcript / notes:
---
${inputText}
---

Return the JSON analysis now.`;

  const response = await model.generateContent([
    { text: SYSTEM_PROMPT },
    { text: userPrompt },
  ]);

  const rawText = response.response.text();
  let parsed: unknown;

  try {
    // Strip markdown fences if the model adds them despite responseMimeType
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI returned invalid JSON: ${rawText.slice(0, 200)}`);
  }

  const result = validateAndNormalize(parsed);
  return { result, modelUsed: `gemini/${modelName}`, rawResponse: parsed };
}

function validateAndNormalize(raw: unknown): AnalysisResult {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("AI response is not a JSON object");
  }

  const r = raw as Record<string, unknown>;
  const VALID_URGENCY = ["low", "medium", "high", "unknown"] as const;

  const urgency = VALID_URGENCY.includes(r.urgency as (typeof VALID_URGENCY)[number])
    ? (r.urgency as AnalysisResult["urgency"])
    : "unknown";

  const confidence = Math.min(100, Math.max(0, Number(r.confidence_score ?? 0)));

  return {
    pain_points: toStringArray(r.pain_points),
    product_interest: toStringArray(r.product_interest),
    business_need: toString(r.business_need),
    urgency,
    timeline: toString(r.timeline),
    budget_signal: toString(r.budget_signal),
    decision_maker_signal: toString(r.decision_maker_signal),
    competitor_mentioned: toString(r.competitor_mentioned),
    next_best_action: toString(r.next_best_action),
    summary: toString(r.summary),
    recommended_follow_up: toString(r.recommended_follow_up),
    confidence_score: confidence,
    needs_human_review: confidence < 70 ? true : Boolean(r.needs_human_review),
  };
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v) return [v];
  return [];
}

function toString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

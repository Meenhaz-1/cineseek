import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CoachRequest = {
  query?: unknown;
  analysis?: unknown;
};

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "AI coach is not configured. Add OPENAI_API_KEY to frontend/.env.local.",
      },
      { status: 503 },
    );
  }

  let body: CoachRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (
    typeof body.query !== "string" ||
    body.query.length === 0 ||
    body.query.length > 300
  ) {
    return NextResponse.json(
      { error: "Query must contain 1–300 characters." },
      { status: 400 },
    );
  }
  const serializedAnalysis = JSON.stringify(body.analysis);
  if (!body.analysis || serializedAnalysis.length > 6_000) {
    return NextResponse.json(
      { error: "Query analysis is missing or too large." },
      { status: 400 },
    );
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-nano",
      store: false,
      max_output_tokens: 140,
      instructions: [
        "You are the CineSeek query-analysis coach.",
        "Write one concise paragraph of 2–4 sentences for a learner.",
        "Explain what the deterministic query parser understood correctly, then identify the most important limitation or improvement.",
        "Treat the supplied analysis as authoritative. Never claim a capability that is absent from it.",
        "Use plain language and refer to the user's exact query when useful.",
      ].join(" "),
      input: `Query: ${body.query}\nDeterministic analysis: ${serializedAnalysis}`,
    });
    const paragraph = response.output_text.trim();
    if (!paragraph) throw new Error("The model returned no text.");
    return NextResponse.json({ paragraph, model: response.model });
  } catch (error) {
    console.error("Query coach request failed", error);
    return NextResponse.json(
      {
        error:
          "The AI coach could not generate an explanation. Try again shortly.",
      },
      { status: 502 },
    );
  }
}

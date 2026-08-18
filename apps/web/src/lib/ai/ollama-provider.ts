import type { AIProvider, AISuggestionInput } from "./provider";

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

export class OllamaProvider implements AIProvider {
  async generateCoaching(input: AISuggestionInput): Promise<string> {
    const prompt = buildPrompt(input);

    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.1:8b",
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }
}

function buildPrompt(input: AISuggestionInput): string {
  const riskyPeriods = input.periods.filter((p) => p.isCashflowRisk);
  const threePaycheckMonths = input.periods.filter((p) => p.isThreePaycheckMonth);

  return `You are a friendly, encouraging financial coach helping someone manage their bills. Be concise, warm, and practical — no more than 150 words. Do not repeat numbers back mechanically; explain what they mean and what to do.

Here is their financial situation:

Risky pay periods (bills exceed income): ${JSON.stringify(riskyPeriods, null, 2)}

3-paycheck months (extra income opportunity): ${JSON.stringify(threePaycheckMonths, null, 2)}

Split suggestions already calculated: ${JSON.stringify(input.splitSuggestions, null, 2)}

Opportunity suggestions already calculated: ${JSON.stringify(input.opportunitySuggestions, null, 2)}

Write a short, encouraging summary of their situation and the top 1-2 most important actions they should consider, based only on the data above. If everything looks fine, say so briefly and positively.`;
}
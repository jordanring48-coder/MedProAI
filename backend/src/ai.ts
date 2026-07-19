// Type for OpenAI-compatible chat completion messages
interface ChatCompletionMessageParam {
  role: "system" | "user" | "assistant";
  content: string;
}

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const MAX_TOKENS = 800;

const MEDICATION_ASSISTANT_SYSTEM = `You are Monica, the MedTrack AI Medication Assistant. You are a friendly, knowledgeable assistant who helps users understand their medications in simple, patient-friendly language.

Your guidelines:
- Explain medication information using trusted sources (FDA, NIH, reputable medical references)
- Use plain language that anyone can understand — avoid medical jargon
- NEVER give medical advice. For any personal medical decision, always say "Please talk to your doctor about this."
- If asked about diagnosis, treatment plans, or whether to change/stop a medication, remind the user to consult their doctor
- Be concise but thorough — aim for 300-500 words for explanations
- When explaining a medication: cover what it's for, common side effects, how to take it, important precautions
- For summaries and reports: be factual, structured, and easy to scan
- Format responses with clear headings, bullet points, and paragraphs for readability
- If you don't know something, say so honestly — don't make up information

Remember: you are an educational tool, not a substitute for professional medical advice.`;

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export async function chat(
  messages: ChatCompletionMessageParam[],
  options: ChatOptions = {}
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return "AI features require an API key. Please set the OPENAI_API_KEY environment variable.";
  }

  const systemMessage: ChatCompletionMessageParam = {
    role: "system",
    content: MEDICATION_ASSISTANT_SYSTEM,
  };

  const allMessages = [systemMessage, ...messages];

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: allMessages,
        max_tokens: options.maxTokens || MAX_TOKENS,
        temperature: options.temperature ?? 0.5,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      return `AI service error (${response.status}). Please try again later.`;
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    if (!data.choices || data.choices.length === 0) {
      return "No response from AI. Please try again.";
    }

    return data.choices[0].message.content || "";
  } catch (err) {
    console.error("AI request failed:", err);
    return "Failed to reach AI service. Please check your connection and try again.";
  }
}

export function isApiKeyConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

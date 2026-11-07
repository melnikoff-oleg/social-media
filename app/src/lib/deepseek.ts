/** DeepSeek's OpenAI-compatible chat endpoint. */
export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
export const DEEPSEEK_DEFAULT_MODEL = "deepseek-chat";

/** Timeout for one concept-generation request (same as the Claude client). */
const DEEPSEEK_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `# ROLE
You're an expert in creating viral Reels on Instagram.

# OBJECTIVE
Take as input viral video from my competitor and based on it generate new concepts for me. Adapt this reference for me.`;

type ChatCompletion = {
  choices?: { message?: { content?: string | null } }[];
};

/**
 * Generates new video concepts with DeepSeek. Same signature as the Claude client's
 * `generateNewConcepts`, so the pipeline can use either one.
 *
 * Errors never carry the response body or the API key: they may end up in logs.
 */
export async function generateNewConcepts(
  videoAnalysis: string,
  newConceptsPrompt: string
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY não configurada");

  const model = process.env.DEEPSEEK_MODEL || DEEPSEEK_DEFAULT_MODEL;

  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `# REFERENCE VIDEO DESCRIPTION
------
${videoAnalysis}
------

# MY INSTRUCTIONS FOR NEW CONCEPTS
------
${newConceptsPrompt}
------

# BEGIN YOUR WORK`,
        },
      ],
    }),
    signal: AbortSignal.timeout(DEEPSEEK_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Drain the body without exposing it.
    await response.body?.cancel().catch(() => {});
    throw new Error(`Erro na API do DeepSeek: status ${response.status}`);
  }

  const data = (await response.json()) as ChatCompletion;
  return data.choices?.[0]?.message?.content ?? "";
}

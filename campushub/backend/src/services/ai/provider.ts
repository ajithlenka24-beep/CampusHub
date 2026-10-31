/**
 * LLM provider abstraction. The API key only ever lives on the server
 * (environment variable) and is never sent to the browser.
 *
 *  AI_PROVIDER=anthropic → Anthropic Messages API
 *  AI_PROVIDER=openai    → OpenAI Chat Completions API (or any OpenAI-compatible
 *                          endpoint via AI_BASE_URL, e.g. a local model server)
 *  AI_PROVIDER=none      → AI disabled; callers use the rule-based fallback
 */
import { env } from "../../config/env.js";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  system: string;
  messages: ChatTurn[];
  maxTokens?: number;
}

export interface GenerateResult {
  text: string;
  provider: string; // e.g. "anthropic:<model>"
}

export class AiProviderError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "AiProviderError";
  }
}

export function aiStatus() {
  return env.aiEnabled
    ? { mode: "ai" as const, provider: env.AI_PROVIDER, model: env.AI_MODEL, label: `AI assistant (${env.AI_PROVIDER} · ${env.AI_MODEL})` }
    : { mode: "fallback" as const, provider: "fallback", model: "", label: "Basic assistant: no AI provider is configured, so answers come from built-in rules." };
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const message = (data?.error as { message?: string })?.message ?? `HTTP ${response.status}`;
      throw new AiProviderError(`AI provider error: ${message}`, response.status);
    }
    return data;
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if ((error as Error).name === "AbortError") throw new AiProviderError("The AI provider took too long to respond.");
    throw new AiProviderError(`Could not reach the AI provider: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic({ system, messages, maxTokens = 800 }: GenerateOptions): Promise<string> {
  const base = (env.AI_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
  const data = await postJson(
    `${base}/v1/messages`,
    { "x-api-key": env.AI_API_KEY, "anthropic-version": "2023-06-01" },
    { model: env.AI_MODEL, max_tokens: maxTokens, system, messages },
  );
  const content = (data.content as { type: string; text?: string }[] | undefined) ?? [];
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
}

async function callOpenAi({ system, messages, maxTokens = 800 }: GenerateOptions): Promise<string> {
  const usingOpenAi = !env.AI_BASE_URL;
  const base = (env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const data = await postJson(
    `${base}/chat/completions`,
    { authorization: `Bearer ${env.AI_API_KEY}` },
    {
      model: env.AI_MODEL,
      messages: [{ role: "system", content: system }, ...messages],
      // OpenAI's newer models use max_completion_tokens; most compatible servers use max_tokens
      ...(usingOpenAi ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    },
  );
  const choices = (data.choices as { message?: { content?: string } }[] | undefined) ?? [];
  return (choices[0]?.message?.content ?? "").trim();
}

/** Sends a prompt to the configured provider. Throws AiProviderError on failure. */
export async function generateText(options: GenerateOptions): Promise<GenerateResult> {
  if (!env.aiEnabled) throw new AiProviderError("No AI provider is configured.");
  const text = env.AI_PROVIDER === "anthropic" ? await callAnthropic(options) : await callOpenAi(options);
  if (!text) throw new AiProviderError("The AI provider returned an empty answer.");
  return { text, provider: `${env.AI_PROVIDER}:${env.AI_MODEL}` };
}

const OpenAI = require("openai");
const env = require("../config/env");

const client = env.openAiApiKey
  ? new OpenAI({
      apiKey: env.openAiApiKey,
      timeout: env.openAiTimeoutMs,
      maxRetries: env.openAiMaxRetries,
    })
  : null;

function isOpenAiConfigured() {
  return Boolean(client);
}

function compactError(error) {
  if (!error) return "Unknown OpenAI error";
  return error.message || String(error);
}

function stripJsonFence(value) {
  return String(value || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseJsonOrFallback(raw, fallback) {
  const cleaned = stripJsonFence(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

function normalizeMessages({ system, messages = [], prompt }) {
  const normalized = [];
  if (system) normalized.push({ role: "system", content: system });
  for (const message of messages) {
    if (!message?.content) continue;
    normalized.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content).slice(0, 6000),
    });
  }
  if (prompt)
    normalized.push({ role: "user", content: String(prompt).slice(0, 12000) });
  return normalized;
}

async function createChatCompletion({
  system,
  messages,
  prompt,
  temperature = 0.3,
  maxTokens = 900,
  responseFormat,
  fallback = "",
  purpose = "openai",
}) {
  if (!client) {
    return {
      content: fallback,
      source: "fallback",
      errorMessage: "OPENAI_API_KEY is not configured",
    };
  }

  try {
    console.log("OpenAI request", {
      purpose,
      system: Boolean(system),
      messages: messages?.length || 0,
      prompt: Boolean(prompt),
    });
    const completion = await client.chat.completions.create({
      model: env.openAiModel,
      temperature,
      max_tokens: maxTokens,
      response_format: responseFormat,
      messages: normalizeMessages({ system, messages, prompt }),
    });

    console.log(
      "OpenAI response",
      {
        purpose,
        model: completion.model,
        usage: completion.usage,
      },
      completion,
    );
    const content = completion.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return {
        content: fallback,
        source: "fallback",
        model: completion.model || env.openAiModel,
        usage: completion.usage,
        errorMessage: "OpenAI returned an empty response",
      };
    }

    return {
      content,
      source: "openai",
      model: completion.model || env.openAiModel,
      usage: completion.usage,
    };
  } catch (error) {
    const errorMessage = compactError(error);
    console.error(`OpenAI ${purpose} fallback triggered: ${errorMessage}`);
    return {
      content: fallback,
      source: "fallback",
      errorMessage,
    };
  }
}

async function generateText({
  system,
  messages,
  prompt,
  fallback,
  temperature = 0.35,
  maxTokens = 700,
  purpose,
}) {
  return createChatCompletion({
    system,
    messages,
    prompt,
    fallback,
    temperature,
    maxTokens,
    purpose,
  });
}

async function generateStructuredJson({
  system,
  prompt,
  fallback,
  temperature = 0.2,
  maxTokens = 1800,
}) {
  const result = await createChatCompletion({
    system,
    prompt: `${prompt}\n\nReturn one valid JSON object only. Do not include markdown fences or commentary.`,
    fallback: JSON.stringify(fallback),
    temperature,
    maxTokens,
    responseFormat: { type: "json_object" },
    purpose: "structured_json",
  });

  if (result.source !== "openai") {
    return fallback;
  }

  return parseJsonOrFallback(result.content, fallback);
}

module.exports = {
  createChatCompletion,
  generateStructuredJson,
  generateText,
  isOpenAiConfigured,
};

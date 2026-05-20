const OpenAI = require("openai");
const env = require("../config/env");

const client = env.openAiApiKey ? new OpenAI({ apiKey: env.openAiApiKey }) : null;

async function generateStructuredJson({ system, prompt, fallback }) {
  if (!client) {
    return fallback;
  }

  try {
    const response = await client.responses.create({
      model: env.openAiModel,
      input: [
        { role: "system", content: system },
        { role: "user", content: `${prompt}\n\nReturn valid JSON only.` }
      ]
    });

    const raw = response.output_text || "{}";
    return JSON.parse(raw);
  } catch (error) {
    console.error("OpenAI fallback triggered", error.message);
    return fallback;
  }
}

module.exports = { generateStructuredJson };

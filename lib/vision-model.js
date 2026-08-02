/**
 * Which vision model to use for OCR, per provider.
 *
 * Handwritten Indian bill slips are the hard case — the quantity column is the
 * thing that gets misread, and a weak model reads "11" as "1". Defaults are the
 * strongest reasonable vision model on each provider, so deleting OCR_MODEL
 * degrades gracefully instead of silently dropping back to a mini model.
 */

export const VISION_DEFAULTS = {
  // High-resolution vision tier (2576px long edge), $2/$10 per MTok
  openrouter: "anthropic/claude-sonnet-5",
  // Full gpt-4o, not -mini: mini misreads handwritten digits
  openai: "gpt-4o",
  // Only vision-capable Grok
  xai: "grok-2-vision-1212",
};

/** Provider is chosen by which key is present — same order as the request code. */
export function activeVisionProvider(env = process.env) {
  if (env.OPENROUTER_API_KEY) return "openrouter";
  if (env.OPENAI_API_KEY) return "openai";
  return "xai";
}

/**
 * Resolve the model id for a provider.
 *
 * OCR_MODEL is a single global override, but model ids are provider-specific:
 * "anthropic/claude-sonnet-5" is valid on OpenRouter and a 400 on OpenAI. So a
 * vendor-prefixed override is ignored on non-OpenRouter providers rather than
 * being sent and failing.
 */
export function visionModel(provider = activeVisionProvider(), env = process.env) {
  const fallback = VISION_DEFAULTS[provider] || VISION_DEFAULTS.openrouter;
  const override = String(env.OCR_MODEL || "").trim();
  if (!override) return fallback;
  if (provider === "openrouter") return override;
  // A "vendor/model" id is OpenRouter syntax — not valid elsewhere
  if (override.includes("/")) return fallback;
  return override;
}

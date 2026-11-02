export type OpenAIUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number };
};

export function usageFromOpenAIStream(payload: string) {
  let usage: OpenAIUsage | null = null;
  for (const line of payload.split("\n")) {
    if (!line.startsWith("data:")) {
      continue;
    }
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") {
      continue;
    }
    try {
      const json = JSON.parse(data) as { usage?: OpenAIUsage };
      if (json.usage) {
        usage = json.usage;
      }
    } catch {
      // ignore malformed SSE lines
    }
  }
  return usage;
}

export function cachedInputTokens(usage: { prompt_tokens_details?: { cached_tokens?: number }; input_tokens_details?: { cached_tokens?: number } } | undefined) {
  return usage?.prompt_tokens_details?.cached_tokens || usage?.input_tokens_details?.cached_tokens || 0;
}

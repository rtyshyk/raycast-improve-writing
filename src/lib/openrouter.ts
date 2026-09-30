const API_URL = "https://openrouter.ai/api/v1";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type OpenRouterModel = {
  id: string;
  name: string;
  created: number;
  context_length: number;
  pricing: { prompt: string; completion: string };
  architecture?: { output_modalities?: string[] };
};

type StreamOptions = {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  effort: string;
  signal: AbortSignal;
  onDelta: (text: string) => void;
};

export async function streamChat({ apiKey, model, messages, effort, signal, onDelta }: StreamOptions) {
  const response = await fetch(`${API_URL}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://www.raycast.com/roman.tyshyk/improve-writing-openrouter",
      "X-Title": "Improve Writing (Raycast)",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      reasoning: { effort, exclude: true },
    }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  if (!response.body) throw new Error("OpenRouter returned an empty response");

  const decoder = new TextDecoder();
  let buffer = "";
  let finishReason: string | undefined;
  // Returns false on the [DONE] sentinel.
  const handle = (raw: string) => {
    const line = raw.trim();
    if (!line.startsWith("data:")) return true;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return false;
    const event = JSON.parse(data);
    if (event.error) throw new Error(event.error.message ?? "OpenRouter stream error");
    const choice = event.choices?.[0];
    if (choice?.delta?.content) onDelta(choice.delta.content);
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    return true;
  };

  let open = true;
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while (open && (newline = buffer.indexOf("\n")) >= 0) {
      open = handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
    if (!open) break;
  }
  if (open) handle(buffer + decoder.decode());
  // A cut-off reply would otherwise be pasted over the selection as if it were complete.
  if (finishReason === "length") throw new Error("The reply hit the model's output limit and was cut off");
  if (finishReason === "content_filter") throw new Error("The provider's content filter stopped the reply");
}

export async function fetchModels(): Promise<OpenRouterModel[]> {
  const response = await fetch(`${API_URL}/models`);
  if (!response.ok) throw new Error(await errorMessage(response));
  const { data } = (await response.json()) as { data: OpenRouterModel[] };
  return data
    .filter((m) => !m.id.endsWith(":batch") && (m.architecture?.output_modalities ?? ["text"]).includes("text"))
    .map(({ id, name, created, context_length, pricing }) => ({
      id,
      name,
      created,
      context_length,
      pricing: { prompt: pricing.prompt, completion: pricing.completion },
    }));
}

async function errorMessage(response: Response) {
  const body = await response.text();
  let message = body;
  try {
    message = JSON.parse(body).error?.message ?? body;
  } catch {
    // not JSON, keep the raw body
  }
  if (response.status === 401) return `Invalid OpenRouter API key (${message})`;
  if (response.status === 402) return `Not enough OpenRouter credits (${message})`;
  return `OpenRouter ${response.status}: ${message || response.statusText}`;
}

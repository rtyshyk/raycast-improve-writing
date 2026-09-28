import { getActiveModel } from "./model";
import { streamChat } from "./openrouter";
import { renderDiff, renderText } from "./preview";
import { buildMessages, cleanReply, getPrompt, Turn } from "./prompt";

export const FLUSH_MS = 80;

export type TurnState = Omit<Turn, "instruction">;

type GenerateOptions = {
  apiKey: string;
  effort: string;
  text: string;
  history: Turn[];
  instruction?: string;
  signal: AbortSignal;
  onUpdate: (state: TurnState) => void;
};

// Streams one version, reporting it at most every FLUSH_MS. A stopped stream keeps its partial text.
export async function generateTurn({
  apiKey,
  effort,
  text,
  history,
  instruction,
  signal,
  onUpdate,
}: GenerateOptions): Promise<TurnState> {
  let reply = "";
  let flushedAt = 0;
  try {
    const [prompt, model] = await Promise.all([getPrompt(), getActiveModel()]);
    await streamChat({
      apiKey,
      model,
      effort,
      signal,
      messages: buildMessages(prompt, text, history, instruction),
      onDelta: (delta) => {
        reply += delta;
        if (Date.now() - flushedAt >= FLUSH_MS) {
          flushedAt = Date.now();
          onUpdate({ reply: cleanReply(reply, text), status: "streaming" });
        }
      },
    });
    if (!cleanReply(reply, text)) throw new Error("The model returned an empty reply");
  } catch (e) {
    if (!signal.aborted) {
      return { reply: cleanReply(reply, text), status: "failed", error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { reply: cleanReply(reply, text), status: "done" };
}

export const followUpHistory = (turns: Turn[]) => turns.filter((turn) => turn.status === "done" && turn.reply);

export function turnPreview(turn: Turn, text: string) {
  if (turn.status === "failed") return `## Couldn't improve the text\n\n${turn.error}`;
  if (turn.status === "streaming") return renderText(turn.reply);
  return renderDiff(text, turn.reply);
}

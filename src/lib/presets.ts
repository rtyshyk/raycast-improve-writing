import { environment, Icon, Keyboard } from "@raycast/api";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type Preset = {
  title: string;
  icon: Icon;
  key: Keyboard.KeyEquivalent;
  instruction: string | (() => Promise<string>);
};

// blader/humanizer's SKILL.md, vendored unchanged (MIT, see assets/humanizer/LICENSE).
async function humanize() {
  const guide = await readFile(join(environment.assetsPath, "humanizer", "SKILL.md"), "utf8");
  return `remove the signs of AI writing, following the guide below in its embedded mode, so reply with the final rewrite only.\n\n<guide>\n${guide}\n</guide>`;
}

export const PRESETS: Preset[] = [
  { title: "Shorter", icon: Icon.ShortParagraph, key: "1", instruction: "make it shorter" },
  { title: "More Formal", icon: Icon.Building, key: "2", instruction: "make it more formal" },
  { title: "More Casual", icon: Icon.SpeechBubble, key: "3", instruction: "make it more casual" },
  {
    title: "Fix Grammar Only",
    icon: Icon.Checkmark,
    key: "4",
    instruction: "go back to the original text and only fix spelling, grammar and punctuation, without rewording it",
  },
  { title: "Translate to English", icon: Icon.Globe, key: "5", instruction: "translate it to English" },
  { title: "Humanize", icon: Icon.Person, key: "6", instruction: humanize },
];

export const presetInstruction = async ({ instruction }: Preset) =>
  typeof instruction === "string" ? instruction : instruction();

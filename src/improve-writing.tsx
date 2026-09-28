import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  getSelectedText,
  Icon,
  LaunchProps,
  showToast,
  Toast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { ImproveView } from "./components/ImproveView";

async function readSelection() {
  try {
    const text = await getSelectedText();
    return text.trim() ? text : "";
  } catch {
    return "";
  }
}

// A deeplink can pass the text directly: raycast://extensions/…/improve-writing?context={"text":"…"}
export default function Command({ launchContext }: LaunchProps<{ launchContext: { text?: string } }>) {
  const passed = launchContext?.text;
  const fromLink = typeof passed === "string" && passed.trim() ? passed : undefined;
  const { data: selection, isLoading } = usePromise(readSelection, [], { execute: !fromLink });
  const [fromClipboard, setFromClipboard] = useState<string>();

  const text = fromLink || fromClipboard || selection;
  if (text) return <ImproveView original={text} />;
  if (isLoading) return <Detail isLoading />;

  return (
    <Detail
      markdown={
        "## No text selected\n\nSelect some text in the frontmost app and run **Improve Writing** again, or improve the clipboard text instead.\n\nWith clipboard text, **Paste Response** pastes at the cursor."
      }
      actions={
        <ActionPanel>
          <Action
            title="Use Clipboard Text"
            icon={Icon.Clipboard}
            onAction={async () => {
              const clipboard = await Clipboard.readText();
              if (clipboard?.trim()) setFromClipboard(clipboard);
              else await showToast({ style: Toast.Style.Failure, title: "Clipboard has no text" });
            }}
          />
        </ActionPanel>
      }
    />
  );
}

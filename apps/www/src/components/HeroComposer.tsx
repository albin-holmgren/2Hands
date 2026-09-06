import { useRef, useState, type SubmitEvent } from "react";
import { PREVIEW_PROMPT_EVENT, type PreviewPromptDetail } from "../preview-events";

const suggestions = [
  {
    label: "Research an idea",
    prompt: "Research an idea for a quiet weekend planner. Compare three directions and summarize the trade-offs.",
  },
  {
    label: "Plan a project",
    prompt: "Help me plan a product launch, with clear milestones and a practical first week.",
  },
  {
    label: "Build something",
    prompt: "Create a first draft of a habit tracker with a daily check-in and a weekly progress view.",
  },
];

/** Prompts stay in this page's interactive preview; no service is invoked. */
export function HeroComposer() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<PreviewPromptDetail["model"]>("Claude");
  const input = useRef<HTMLTextAreaElement>(null);

  function openPreview(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;
    window.dispatchEvent(new CustomEvent<PreviewPromptDetail>(PREVIEW_PROMPT_EVENT, {
      detail: { prompt: trimmed, model },
    }));
    document.getElementById("demo")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <div className="hc-composer">
      <form className="hc-card" aria-label="Interactive workspace preview" onSubmit={openPreview}>
        <textarea
          ref={input}
          className="hc-input"
          aria-label="Describe a task"
          placeholder="Ask 2hands to research, plan, or build…"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={500}
          rows={3}
        />
        <div className="hc-footer">
          <select
            className="hc-model"
            aria-label="Preview model"
            value={model}
            onChange={(event) => setModel(event.target.value as PreviewPromptDetail["model"])}
          >
            <option value="Claude">Claude</option>
            <option value="GPT">GPT</option>
            <option value="Gemini">Gemini</option>
          </select>
          <span className="hc-preview-label">Interactive preview</span>
          <button
            className="hc-submit"
            type="submit"
            aria-label="Open workspace preview"
            disabled={!prompt.trim()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5m-6 6 6-6 6 6" />
            </svg>
          </button>
        </div>
      </form>
      <div className="hc-suggestions" role="group" aria-label="Example tasks">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.label}
            className="hc-suggestion"
            type="button"
            onClick={() => {
              setPrompt(suggestion.prompt);
              input.current?.focus({ preventScroll: true });
            }}
          >
            {suggestion.label}
          </button>
        ))}
      </div>
    </div>
  );
}

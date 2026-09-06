export const PREVIEW_PROMPT_EVENT = "2hands:preview-prompt";

export type PreviewPromptDetail = {
  prompt: string;
  model: "Claude" | "GPT" | "Gemini";
};

declare global {
  interface WindowEventMap {
    "2hands:preview-prompt": CustomEvent<PreviewPromptDetail>;
  }
}

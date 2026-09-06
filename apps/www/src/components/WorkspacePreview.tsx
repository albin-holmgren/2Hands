import { Button } from "@rakazo/ui-web";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { LandingBotAvatar } from "./LandingBotAvatar";
import { PREVIEW_PROMPT_EVENT } from "../preview-events";
import "../styles/workspace-preview.css";

const workspaces = ["Personal", "Studio", "Side project"];
const models = ["GPT", "Claude", "Gemini"];
const assistants = [
  { name: "Pip", role: "Your right hand", icon: "chief" as const },
  { name: "Scout", role: "Research & discoveries", icon: "research" as const },
  { name: "Kit", role: "Build & create", icon: "builder" as const },
];
const examples = [
  { prompt: "Find three quiet places for a weekend away from the city.", title: "A slower weekend", summary: "A little sea air, a cabin in the hills, or a few days among the trees. Here’s a shortlist with room to slow down.", items: ["A cottage by the coast", "A cabin in the hills", "A hideaway in the woods"], detail: "Three directions for a quieter weekend", source: "Travel notes" },
  { prompt: "Explore three directions for our next product launch.", title: "The next chapter", summary: "Lead with the people using it, show the small details, and make the first step feel effortless. I brought the ideas into one brief.", items: ["Stories from everyday work", "A closer look at the details", "One clear invitation to try"], detail: "Three ideas for a thoughtful launch", source: "Launch notes" },
  { prompt: "Help me shape a simple habit tracker I’ll actually use.", title: "Small steps, every day", summary: "Start with one habit, a gentle daily check-in, and a view of your progress. Here’s a small, focused first version.", items: ["One habit to begin with", "A quick daily check-in", "A week of small wins"], detail: "A focused brief for a first version", source: "Project notes" },
];
const paths = {
  chevron: "m6 9 6 6 6-6", arrow: "M12 19V5m-6 6 6-6 6 6", check: "m5 12 4 4L19 6",
  file: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Zm0 0v5h5M8 12h8m-8 4h5",
  panel: "M4 4h16v16H4zM15 4v16", search: "m20 20-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  replay: "M4 10a8 8 0 1 1 1 7M4 4v6h6", plus: "M12 5v14M5 12h14", back: "m14 6-6 6 6 6",
};
function Icon({ name }: { name: keyof typeof paths }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
      </svg>;
}

function Picker({ label, options, value, onChange, above = false }: {
  label: string; options: string[]; value: string; onChange: (value: string) => void; above?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function keys(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
    }
    const choices = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const current = choices.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? (current + 1) % choices.length
      : event.key === "ArrowUp" ? (current + choices.length - 1) % choices.length
      : event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); choices[next]?.focus(); }
  }
  return <div className={`wp-picker ${above ? "wp-picker-above" : ""}`} ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className="wp-picker-trigger" aria-label={`${label}: ${value}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)} onKeyDown={(event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
    }}>
      <span>{value}</span>
      <Icon name="chevron" />
      </button>
    {open && <div id={id} className="wp-menu" role="listbox" aria-label={label} onKeyDown={keys}>
      <span className="wp-menu-label">{label === "Model" ? "Example models" : label === "Assistant" ? "Your extra hands" : "Your workspaces"}</span>
      {options.map((option) => <button key={option} type="button" role="option" aria-selected={option === value} tabIndex={-1} onClick={() => { onChange(option); setOpen(false); trigger.current?.focus(); }}>
      <span>{option}</span>{option === value && <Icon name="check" />}</button>)}
    </div>}
  </div>;
}

/** A local, synthetic walkthrough; no prompts are sent and no tasks are executed. */
export function WorkspacePreview() {
  const [workspace, setWorkspace] = useState("Personal");
  const [assistant, setAssistant] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState<"Files" | "Activity">("Files");
  const [workOpen, setWorkOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const workTrigger = useRef<HTMLButtonElement>(null);
  const closeWork = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const wasWorkOpen = useRef(false);
  const scope = `${workspace}:${assistant}`;
  const bot = assistants[assistant]!;
  const example = examples[workspaces.indexOf(workspace)]!;
  const model = selections[scope] ?? "Claude";
  const draft = drafts[scope] ?? "";
  const title = assistant === 2 ? `${example.title} · first draft` : example.title;
  const file = `${title.toLowerCase().replaceAll(" · ", "-").replaceAll(" ", "-")}.${assistant === 2 ? "html" : "md"}`;
  useEffect(() => { clearTimeout(timer.current); setPlaying(false); }, [scope]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    let focusFrame = 0;
    const receivePrompt = (event: WindowEventMap[typeof PREVIEW_PROMPT_EVENT]) => {
      const detail = event.detail;
      if (!detail || typeof detail.prompt !== "string" || !models.includes(detail.model)) return;
      const prompt = detail.prompt.trim().slice(0, 500);
      if (!prompt) return;
      setDrafts((values) => ({ ...values, [scope]: prompt }));
      setSelections((values) => ({ ...values, [scope]: detail.model }));
      setWorkOpen(false);
      cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => composer.current?.focus({ preventScroll: true }));
    };
    window.addEventListener(PREVIEW_PROMPT_EVENT, receivePrompt);
    return () => {
      window.removeEventListener(PREVIEW_PROMPT_EVENT, receivePrompt);
      cancelAnimationFrame(focusFrame);
    };
  }, [scope]);
  useEffect(() => {
    if (workOpen) closeWork.current?.focus();
    else if (wasWorkOpen.current) workTrigger.current?.focus();
    wasWorkOpen.current = workOpen;
  }, [workOpen]);
  function replay() {
    if (playing) return;
    if (draft.trim()) {
      setPrompts((values) => ({ ...values, [scope]: draft.trim() }));
      setDrafts((values) => ({ ...values, [scope]: "" }));
    }
    setPlaying(true);
    timer.current = setTimeout(() => setPlaying(false), 900);
  }
  function returnToChat() { setWorkOpen(false); }
  const workspacePicker = <Picker label="Workspace" options={workspaces} value={workspace} onChange={setWorkspace} />;
  return <div className="wp-stage">
    <section className="wp-window" aria-label="2hands interactive product preview" data-testid="workspace-preview">
      <div className="wp-topbar">
      <div className="wp-brand">
      <span className="wp-dots" aria-hidden="true">
      <i />
      <i />
      <i />
      </span>
      <strong className="wp-wordmark"><img src="/brand/twohands-mark.svg" alt="" aria-hidden="true" width="20" height="20" />2hands</strong>
      </div>
      <div className="wp-mobile-workspace">{workspacePicker}</div>
      <span className="wp-preview-label">
      <span />Interactive preview</span>
      </div>
      <div className="wp-body">
        <aside className="wp-sidebar" aria-label="Preview workspace">
          <div className="wp-workspace">
      <span className="wp-workspace-icon">{workspace[0]}</span>{workspacePicker}</div>
          <div className="wp-sidebar-heading">Assistants <span>3</span>
      </div>
          <div className="wp-roster">{assistants.map((item, index) => <button key={item.name} className={index === assistant ? "is-selected" : ""} aria-pressed={index === assistant} onClick={() => setAssistant(index)} type="button">
      <LandingBotAvatar role={item.icon} className="landing-bot-avatar" size={36} />
      <span>
      <strong>{item.name}</strong>
      <small>{index === assistant ? "Ready when you are" : item.role}</small>
      </span>{index === assistant && <i />}</button>)}</div>
          <div className="wp-sidebar-note">
      <Icon name="plus" />
      <span>A little more room to think.</span>
      </div>
          <div className="wp-account">
      <span className="wp-human">A</span>
      <span>
      <strong>Alex</strong>
      <small>Personal account</small>
      </span>
      <span className="wp-free">Free</span>
      </div>
        </aside>
        <section className={`wp-chat ${workOpen ? "wp-chat-covered" : ""}`} aria-label="Example conversation">
          <header className="wp-chat-header">
      <LandingBotAvatar role={bot.icon} className={`landing-bot-avatar ${playing ? "is-working" : ""}`} size={32} />
      <div>
      <strong className="wp-assistant-name">{bot.name}</strong>
      <div className="wp-assistant-picker"><Picker label="Assistant" options={assistants.map((item) => item.name)} value={bot.name} onChange={(value) => setAssistant(assistants.findIndex((item) => item.name === value))} /></div>
      <span>{workspace} workspace</span>
      </div>
      <button ref={workTrigger} type="button" className="wp-work-toggle" aria-label="Open example files and activity" aria-expanded={workOpen} onClick={() => setWorkOpen(!workOpen)}>
      <Icon name="panel" />
      </button>
      </header>
          <div className="wp-thread">
            <div className="wp-date">A little earlier</div>
            <div className="wp-user-message">{prompts[scope] ?? (assistant === 2 ? `Make a simple first draft from this brief: ${example.title}.` : example.prompt)}</div>
            <div className="wp-reply">
      <LandingBotAvatar role={bot.icon} className={`landing-bot-avatar ${playing ? "is-working" : ""}`} size={32} />
      <div className="wp-reply-content">
              <div className="wp-reply-name">{bot.name}<span>Example conversation</span>
      </div>
              <div className={`wp-tools ${playing ? "is-playing" : ""}`}>
      <span>
      <Icon name="search" />{assistant === 2 ? "Reviewed the brief" : "Explored the notes"}</span>
      <span>
      <Icon name="check" />{assistant === 2 ? "Prepared a draft" : "Compared 3 ideas"}</span>
      </div>
              <p>{prompts[scope] ? "Here’s a sample of how your result could look. Try another workspace to explore a different example." : assistant === 2 ? "I shaped the brief into a small first draft, with the essentials in place and room to make it your own." : example.summary}</p>
              <button className="wp-artifact" type="button" onClick={() => { setPanel("Files"); setWorkOpen(true); }}>
      <span className="wp-file-icon">
      <Icon name="file" />
      </span>
      <span>
      <strong>{title}</strong>
      <small>{assistant === 2 ? "HTML draft" : "Research brief"} <span>·</span> 3 starting points</small>
      </span>
      <span className="wp-artifact-arrow">↗</span>
      </button>
              <div className="wp-result-status" role="status">
      <span className={playing ? "wp-pulse" : ""}>
      <Icon name={playing ? "replay" : "check"} />{playing ? "Replaying example…" : "Example complete"}</span>
      <span>{model} · sample</span>
      </div>
            </div>
      </div>
          </div>
          <form className="wp-composer" onSubmit={(event) => { event.preventDefault(); replay(); }}>
            <textarea ref={composer} aria-label="Try a prompt in the preview" placeholder={`Ask ${bot.name} anything…`} maxLength={500} rows={2} value={draft} onChange={(event) => setDrafts((values) => ({ ...values, [scope]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); replay(); } }} />
            <div className="wp-composer-controls">
      <Picker label="Model" options={models} value={model} onChange={(value) => setSelections((values) => ({ ...values, [scope]: value }))} above />
      <span className="wp-sample-note">Local demo</span>
      <Button type="submit" size="icon" className="wp-send" disabled={playing} aria-label={draft.trim() ? "Show an example result" : "Replay example"}>
      <Icon name={draft.trim() ? "arrow" : "replay"} />
      </Button>
      </div>
          </form>
          <div className="wp-disclaimer">Sample content. No tasks run or prompts sent.</div>
        </section>
        <aside className={`wp-work ${workOpen ? "is-open" : ""}`} aria-label="Example work panel" onKeyDown={(event) => { if (event.key === "Escape" && workOpen) { event.stopPropagation(); returnToChat(); } }}>
          <div className="wp-work-header">
      <button ref={closeWork} type="button" className="wp-work-back" onClick={returnToChat} aria-label="Return to conversation">
      <Icon name="back" />
      </button>
      <div className="wp-tabs" aria-label="Example work view">{(["Files", "Activity"] as const).map((tab) => <button key={tab} type="button" aria-pressed={panel === tab} className={panel === tab ? "is-selected" : ""} onClick={() => setPanel(tab)}>{tab}</button>)}</div>
      </div>
          <div className="wp-work-content">{panel === "Files" ? <>
      <div className="wp-panel-eyebrow">WORKSPACE FILES</div>
      <div className="wp-file-row">
      <Icon name="file" />
      <span>{file}</span>
      </div>
      <div className="wp-paper">
      <div className="wp-paper-icon">
      <Icon name="file" />
      </div>
      <small>THE SHORTLIST</small>
      <h3>{title}</h3>
      <p>{example.detail}</p>
      <ol>{example.items.map((item) => <li key={item}>
      <span>{item}</span>
      </li>)}</ol>
      <div className="wp-paper-footer">Prepared with {model}<span>Sample brief</span>
      </div>
      </div>
      </> : <>
      <div className="wp-panel-eyebrow">EXAMPLE ACTIVITY</div>
      <div className="wp-activity">{[`${example.source} opened`, "Three directions compared", `${file} prepared`].map((item, index) => <div key={item}>
      <span>
      <Icon name="check" />
      </span>
      <div>
      <strong>{item}</strong>
      <small>Step {index + 1} · sample activity</small>
      </div>
      </div>)}</div>
      <p className="wp-activity-note">Switch models or workspaces to explore the preview.</p>
      </>}</div>
        </aside>
      </div>
    </section>
  </div>;
}

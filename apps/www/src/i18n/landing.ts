import type { Locale } from "./locales";

export const englishLanding = {
  eyebrow: "A little help. A whole lot of possibility.",
  heading: "You’ve got ideas.",
  headingAccent: "We’ve got hands.",
  description: "Research, write, build, and handle the everyday. Bring your AI models and projects together in one thoughtful workspace.",
  explore: "Explore the workspace",
  selfHost: "Self-host for free",
  note: "Open source. Your models. Your own way of working.",
  previewHint: "Take a look around. Switch a workspace, try a model, make it yours.",
  modelsLabel: "Different minds. One workspace.",
  modelsNote: "Choose compatible models, or bring your own API keys.",
  featureEyebrow: "Less friction, more flow",
  featureHeading: "A place for everything\nyou want to move forward.",
  featureDescription: "A fresh project, a familiar routine, or the idea you finally have time for. Give it a little room to grow.",
  features: [
    { title: "A fresh space for every project.", body: "Keep your files, conversations, and computer state together. Switch projects without bringing yesterday’s context along." },
    { title: "The right mind for the moment.", body: "Choose the model that suits the work. Move between compatible models and your own keys, with usage rates in view." },
    { title: "A little less on your list.", body: "Turn repeat work into routines. Review the results, handle approvals, and pick up where you left off." },
  ],
  workspaceNames: ["Personal", "Studio", "Side project"],
  workspaceMeta: ["Your everyday, organized", "Room for the next big thing", "Just getting started"],
  routineTitle: "Your Monday briefing",
  routineTime: "Every Monday · 9:00 AM",
  routineRows: ["Read the latest updates", "Bring the useful bits together", "Ready for your review"],
  controlEyebrow: "Real work. Still your call.",
  controlHeading: "From “I should”\nto “it’s ready.”",
  controlDescription: "Let your assistants research in the browser, work with files, and make progress on the details. Review their work, respond to approval requests, and take over when you need to.",
  controlLink: "See how it feels",
  controlTags: ["Research", "Browser tasks", "Files & writing", "Coding", "Routines"],
  controlCardTitle: "A little momentum",
  controlCardSubtitle: "The small things, moving forward.",
  controlTasks: ["Research a new idea", "Turn notes into a first draft", "Pick up a project where you left it"],
  pricingEyebrow: "More possibility, at your pace",
  pricingHeading: "Start free. Room to grow.",
  pricingDescription: "One balance for hosted models and active computer time. Clear limits, no automatic overages.",
  planDescriptions: ["For a first idea.", "For your everyday flow.", "For bigger possibilities.", "For your most ambitious work."],
  included: "included usage / month",
  monthly: "/ month",
  freeModels: "Economical hosted models",
  paidModels: "Every compatible hosted model",
  sharedBalance: "One balance across workspaces",
  byok: "Bring your own model keys",
  noCard: "No card or API key required",
  planBadge: "A little more room",
  pricingAvailability: "Hosted access is in a controlled preview. Self-hosting is available today.",
  pricingRates: "View usage details",
  pricingDetails: "Model input, output, and cached-token rates appear in the model picker. Hosted computer time is $0.15 per active hour, billed per second, with a pause after five idle minutes. BYOK inference is billed by your provider; hosted computer time still uses your allowance.",
  faqEyebrow: "A few good questions",
  faqHeading: "Before you make yourself at home.",
  questions: [
    { question: "Can I start for free?", answer: "The Free plan includes $1 of hosted usage each month, with no card or API key required. Public hosted registration is currently closed. You can self-host 2hands today using the setup guide." },
    { question: "Can I choose my AI model?", answer: "Yes. Choose a compatible hosted model in the composer, or connect your own API keys. Paid plans make every compatible hosted model available, with published usage rates. A model change applies to your next run." },
    { question: "What stays inside a workspace?", answer: "Each personal workspace keeps its own conversations, files, memory, credentials, and computer state. Your workspaces share the account’s usage allowance." },
    { question: "What happens when my balance runs out?", answer: "New hosted spending stops, and your existing results stay available. You can wait for the next allowance period or bring your own model key. Hosted computer time still requires available balance. There are no automatic overage charges." },
  ],
  closingEyebrow: "Open source. Open possibilities.",
  closingHeading: "Make room for\nyour next good idea.",
  closingDescription: "A little more focus. A little less busywork. A workspace you can make your own.",
  viewSource: "View the source",
  license: "Built on Rakazo · Apache-2.0",
};

export type LandingCopy = typeof englishLanding;

const germanLanding: LandingCopy = {
  eyebrow: "Ein wenig Hilfe. Jede Menge Möglichkeiten.",
  heading: "Du hast die Ideen.",
  headingAccent: "Wir packen mit an.",
  description:
    "Recherchieren, schreiben, entwickeln und den Alltag erledigen. Bring deine KI-Modelle und Projekte an einem durchdachten Ort zusammen.",
  explore: "Arbeitsbereich entdecken",
  selfHost: "Kostenlos selbst hosten",
  note: "Open Source. Deine Modelle. Deine Art zu arbeiten.",
  previewHint: "Sieh dich um. Wechsle den Arbeitsbereich, probiere ein Modell aus, mach es zu deinem.",
  modelsLabel: "Verschiedene Stärken. Ein Arbeitsbereich.",
  modelsNote: "Wähle kompatible Modelle oder verbinde deine eigenen API-Schlüssel.",
  featureEyebrow: "Weniger Hürden, mehr Freiraum",
  featureHeading: "Ein Platz für alles,\nwas du voranbringen willst.",
  featureDescription:
    "Ein neues Projekt, eine vertraute Routine oder die Idee, für die du endlich Zeit hast. Gib ihr Raum zum Wachsen.",
  features: [
    {
      title: "Ein eigener Bereich für jedes Projekt.",
      body: "Dateien, Gespräche und Computerzustand bleiben zusammen. Wechsle das Projekt, ohne den Kontext des vorherigen mitzunehmen.",
    },
    {
      title: "Das passende Modell für den Moment.",
      body: "Wähle das Modell, das zur Aufgabe passt. Wechsle zwischen kompatiblen Modellen und deinen eigenen API-Schlüsseln – die Nutzungspreise bleiben im Blick.",
    },
    {
      title: "Etwas weniger auf deiner Liste.",
      body: "Mach wiederkehrende Aufgaben zu Routinen. Prüfe die Ergebnisse, erteile Freigaben und mach dort weiter, wo du aufgehört hast.",
    },
  ],
  workspaceNames: ["Persönlich", "Studio", "Nebenprojekt"],
  workspaceMeta: ["Dein Alltag, gut organisiert", "Platz für deine nächste große Idee", "Gerade erst gestartet"],
  routineTitle: "Dein Montagsüberblick",
  routineTime: "Jeden Montag · 9:00 Uhr",
  routineRows: ["Aktuelle Neuigkeiten lesen", "Das Wesentliche zusammenstellen", "Bereit zur Durchsicht"],
  controlEyebrow: "Echte Arbeit. Deine Entscheidung.",
  controlHeading: "Von „Ich sollte mal“\nzu „Ist erledigt.“",
  controlDescription:
    "Lass deine Assistenten im Browser recherchieren, mit Dateien arbeiten und sich um die Details kümmern. Prüfe ihre Arbeit, beantworte Freigabeanfragen und übernimm selbst, wenn du möchtest.",
  controlLink: "So fühlt es sich an",
  controlTags: ["Recherche", "Browser-Aufgaben", "Dateien & Texte", "Programmieren", "Routinen"],
  controlCardTitle: "Ein kleiner Anstoß",
  controlCardSubtitle: "Die kleinen Dinge kommen voran.",
  controlTasks: ["Eine neue Idee recherchieren", "Aus Notizen einen ersten Entwurf machen", "Ein Projekt dort fortsetzen, wo du aufgehört hast"],
  pricingEyebrow: "Mehr Möglichkeiten, in deinem Tempo",
  pricingHeading: "Kostenlos starten. Raum zum Wachsen.",
  pricingDescription:
    "Ein Guthaben für gehostete Modelle und aktive Computerzeit. Klare Grenzen, keine automatischen Mehrkosten bei Überschreitung.",
  planDescriptions: ["Für eine erste Idee.", "Für deinen Arbeitsalltag.", "Für größere Vorhaben.", "Für deine ambitioniertesten Projekte."],
  included: "Nutzungsguthaben / Monat",
  monthly: "/ Monat",
  freeModels: "Kostengünstige gehostete Modelle",
  paidModels: "Alle kompatiblen gehosteten Modelle",
  sharedBalance: "Ein Guthaben für alle Arbeitsbereiche",
  byok: "Eigene Modell-API-Schlüssel nutzen",
  noCard: "Ohne Kreditkarte oder API-Schlüssel",
  planBadge: "Ein bisschen mehr Freiraum",
  pricingAvailability:
    "Der gehostete Dienst ist in einer Vorschau mit begrenztem Zugang. Selbst hosten kannst du schon heute.",
  pricingRates: "Nutzungsdetails ansehen",
  pricingDetails:
    "Die Preise für Eingabe-, Ausgabe- und Cache-Tokens stehen in der Modellauswahl. Gehostete Computer kosten 0,15 US-Dollar pro aktiver Stunde, sekundengenau abgerechnet, und pausieren nach fünf Minuten Leerlauf. Bei eigenen API-Schlüsseln rechnet dein Modellanbieter die KI-Nutzung ab; gehostete Computerzeit wird weiterhin von deinem Guthaben abgezogen.",
  faqEyebrow: "Ein paar gute Fragen",
  faqHeading: "Bevor du es dir hier einrichtest.",
  questions: [
    {
      question: "Kann ich kostenlos starten?",
      answer:
        "Der Free-Tarif enthält jeden Monat 1 US-Dollar Guthaben für gehostete Nutzung – ohne Kreditkarte oder API-Schlüssel. Die öffentliche Registrierung für den gehosteten Dienst ist derzeit geschlossen. Mit der Einrichtungsanleitung kannst du 2hands schon heute selbst hosten.",
    },
    {
      question: "Kann ich mein KI-Modell selbst wählen?",
      answer:
        "Ja. Wähle im Eingabefeld ein kompatibles gehostetes Modell oder verbinde deine eigenen API-Schlüssel. Bezahlte Tarife bieten alle kompatiblen gehosteten Modelle mit veröffentlichten Nutzungspreisen. Ein Modellwechsel gilt ab dem nächsten Durchlauf.",
    },
    {
      question: "Was bleibt innerhalb eines Arbeitsbereichs?",
      answer:
        "Jeder persönliche Arbeitsbereich hat seine eigenen Gespräche, Dateien, Erinnerungen, Zugangsdaten und seinen eigenen Computerzustand. Deine Arbeitsbereiche teilen sich das Nutzungsguthaben deines Kontos.",
    },
    {
      question: "Was passiert, wenn mein Guthaben aufgebraucht ist?",
      answer:
        "Neue kostenpflichtige Nutzung des gehosteten Dienstes stoppt; deine bisherigen Ergebnisse bleiben verfügbar. Du kannst auf den nächsten Guthabenzeitraum warten oder deinen eigenen Modell-API-Schlüssel verwenden. Gehostete Computerzeit benötigt weiterhin verfügbares Guthaben. Es fallen keine automatischen Mehrkosten bei Überschreitung an.",
    },
  ],
  closingEyebrow: "Open Source. Offene Möglichkeiten.",
  closingHeading: "Mach Platz für\ndeine nächste gute Idee.",
  closingDescription:
    "Etwas mehr Fokus. Etwas weniger Kleinkram. Ein Arbeitsbereich, den du zu deinem machst.",
  viewSource: "Quellcode ansehen",
  license: "Auf Basis von Rakazo · Apache-2.0",
};

const koreanLanding: LandingCopy = {
  eyebrow: "작은 도움으로 열리는 더 큰 가능성.",
  heading: "아이디어가 있다면,",
  headingAccent: "함께 실현해요.",
  description:
    "조사하고, 글을 쓰고, 만들고, 일상적인 일도 처리하세요. AI 모델과 프로젝트를 세심하게 설계된 하나의 작업 공간에 모아보세요.",
  explore: "작업 공간 둘러보기",
  selfHost: "무료로 직접 호스팅하기",
  note: "오픈 소스. 원하는 모델. 나만의 작업 방식.",
  previewHint: "편하게 둘러보세요. 작업 공간을 바꾸고, 모델을 골라 나에게 맞게 꾸며보세요.",
  modelsLabel: "서로 다른 강점, 하나의 작업 공간.",
  modelsNote: "호환되는 모델을 선택하거나 내 API 키를 연결하세요.",
  featureEyebrow: "막힘은 줄이고, 흐름은 자연스럽게",
  featureHeading: "앞으로 나아가고 싶은\n모든 일을 위한 공간.",
  featureDescription:
    "새 프로젝트, 익숙한 루틴, 이제야 시간을 낼 수 있게 된 아이디어까지. 자라날 공간을 마련해 주세요.",
  features: [
    {
      title: "프로젝트마다 독립된 공간을.",
      body: "파일, 대화, 컴퓨터 상태를 한곳에 보관하세요. 이전 프로젝트의 맥락이 섞이지 않도록 작업 공간을 바꿀 수 있어요.",
    },
    {
      title: "지금 하는 일에 맞는 모델을.",
      body: "작업에 어울리는 모델을 고르세요. 사용 요금을 확인하며 호환 모델이나 내 API 키로 전환할 수 있어요.",
    },
    {
      title: "할 일 목록은 조금 더 가볍게.",
      body: "반복하는 일을 루틴으로 만드세요. 결과를 검토하고 필요한 작업을 승인하며, 멈췄던 곳에서 이어갈 수 있어요.",
    },
  ],
  workspaceNames: ["개인", "스튜디오", "사이드 프로젝트"],
  workspaceMeta: ["정돈된 나의 일상", "다음 큰 아이디어를 위한 공간", "이제 시작하는 일"],
  routineTitle: "월요일 브리핑",
  routineTime: "매주 월요일 · 오전 9시",
  routineRows: ["최신 소식 살펴보기", "유용한 내용 모으기", "검토할 준비 완료"],
  controlEyebrow: "일은 함께, 결정은 직접.",
  controlHeading: "“해야 하는데”에서\n“준비됐어요”까지.",
  controlDescription:
    "어시스턴트에게 브라우저 조사, 파일 작업, 세부적인 일을 맡겨보세요. 결과를 검토하고 승인 요청에 응답하며, 필요할 때 직접 이어서 작업하세요.",
  controlLink: "직접 둘러보기",
  controlTags: ["조사", "브라우저 작업", "파일과 글쓰기", "코딩", "루틴"],
  controlCardTitle: "작은 시작의 힘",
  controlCardSubtitle: "작은 일들도 하나씩 앞으로.",
  controlTasks: ["새로운 아이디어 조사하기", "메모를 첫 초안으로 다듬기", "하던 프로젝트 이어가기"],
  pricingEyebrow: "나의 속도에 맞춰 넓어지는 가능성",
  pricingHeading: "무료로 시작하고, 필요할 때 넓혀보세요.",
  pricingDescription:
    "호스팅 모델과 활성 컴퓨터 시간이 하나의 잔액을 사용해요. 한도는 명확하게, 자동 초과 요금은 없어요.",
  planDescriptions: ["첫 아이디어를 위해.", "매일의 작업을 위해.", "더 큰 가능성을 위해.", "가장 야심 찬 프로젝트를 위해."],
  included: "월 제공 사용 크레딧",
  monthly: "/월",
  freeModels: "경제적인 호스팅 모델",
  paidModels: "호환되는 모든 호스팅 모델",
  sharedBalance: "작업 공간이 함께 쓰는 하나의 잔액",
  byok: "내 모델 API 키 연결",
  noCard: "카드나 API 키 없이 시작",
  planBadge: "조금 더 넉넉하게",
  pricingAvailability:
    "호스팅 서비스는 제한된 프리뷰로 운영 중이에요. 직접 호스팅은 지금 바로 가능해요.",
  pricingRates: "사용 요금 자세히 보기",
  pricingDetails:
    "모델 선택 메뉴에서 입력, 출력, 캐시 토큰 요금을 확인할 수 있어요. 호스팅 컴퓨터는 활성 시간당 미화 $0.15로 초 단위 청구되며, 5분 동안 사용하지 않으면 일시 정지돼요. 내 API 키를 사용한 모델 실행 요금은 해당 제공업체가 청구하고, 호스팅 컴퓨터 시간은 계속 포함 잔액에서 차감돼요.",
  faqEyebrow: "궁금할 만한 몇 가지",
  faqHeading: "시작하기 전에 알아두세요.",
  questions: [
    {
      question: "무료로 시작할 수 있나요?",
      answer:
        "Free 요금제에는 매월 미화 $1의 호스팅 사용 크레딧이 포함되며, 카드나 API 키가 필요하지 않아요. 현재 호스팅 서비스의 공개 회원가입은 닫혀 있어요. 설치 가이드를 따라 지금 바로 2hands를 직접 호스팅할 수 있어요.",
    },
    {
      question: "AI 모델을 선택할 수 있나요?",
      answer:
        "네. 메시지 입력창에서 호환되는 호스팅 모델을 선택하거나 내 API 키를 연결하세요. 유료 요금제에서는 호환되는 모든 호스팅 모델을 공개된 사용 요금으로 이용할 수 있어요. 모델 변경은 다음 실행부터 적용돼요.",
    },
    {
      question: "작업 공간별로 어떤 정보가 분리되나요?",
      answer:
        "각 개인 작업 공간의 대화, 파일, 메모리, 인증 정보, 컴퓨터 상태는 따로 보관돼요. 사용 크레딧은 계정의 모든 작업 공간이 함께 사용해요.",
    },
    {
      question: "잔액을 다 쓰면 어떻게 되나요?",
      answer:
        "새로운 호스팅 비용 발생은 중단되고, 기존 결과는 계속 볼 수 있어요. 다음 크레딧 제공 기간을 기다리거나 내 모델 API 키를 연결할 수 있어요. 호스팅 컴퓨터를 사용하려면 여전히 잔액이 필요해요. 자동 초과 요금은 부과되지 않아요.",
    },
  ],
  closingEyebrow: "열린 소스, 열린 가능성.",
  closingHeading: "다음 좋은 아이디어를 위한\n자리를 마련하세요.",
  closingDescription:
    "집중은 조금 더, 자잘한 일은 조금 덜. 나에게 맞는 작업 공간을 만들어보세요.",
  viewSource: "소스 코드 보기",
  license: "Rakazo 기반 · Apache-2.0",
};

const landingByLocale: Record<Locale, LandingCopy> = {
  en: englishLanding,
  de: germanLanding,
  ko: koreanLanding,
};

export function getLandingCopy(locale: Locale): LandingCopy {
  return landingByLocale[locale];
}

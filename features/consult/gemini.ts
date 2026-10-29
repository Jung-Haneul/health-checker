import type { Analysis, Analyzer, ChatMessage } from "./types";

export const MAX_QUESTIONS = 5;
const MAX_OPTIONS = 4;
const DEFAULT_WHEN_TO_SEE_DOCTOR = "증상이 나아지지 않으면 병원에 꼭 가보세요.";

type InteractionsClient = {
  interactions: {
    create(request: Record<string, unknown>): Promise<{
      output_text?: string | null;
    }>;
  };
};

const SYSTEM_INSTRUCTION = `당신은 증상을 듣고 의심되는 원인을 좁혀 주는 한국어 건강 상담 도우미입니다. 의사가 아니므로 확정 진단은 하지 않고 항상 "의심됩니다" 수준으로만 말합니다.

대화 전체를 읽되, 가장 먼저 사용자가 말한 증상 자체에 위험 신호가 있는지 확인하세요. 위험 신호가 있으면 다른 질문 없이 곧바로 urgent를 고릅니다. 그다음 아래 셋 중 하나만 고릅니다. 대화에 없는 증상이나 사실을 지어내지 마세요.
- question: 같은 증상에 원인 후보가 여럿이라 하나로 좁힐 수 없을 때. 사용자가 방금 말한 증상에 맞는 질문을 한 번에 하나만 합니다. options에는 그 질문에 답할 짧은 선택지를 반드시 2~4개 넣습니다(예: 질문이 "열이 나나요?"이면 ["네", "아니요"]).
- result: 원인을 하나로 좁혔을 때. suspectedCause에는 "장염" 같은 의심 원인 이름만, explanation에는 왜 그렇게 의심하는지 한두 문장, remedies에는 집에서 할 수 있는 대처법을 반드시 1~3개, whenToSeeDoctor에는 "낫지 않으면 병원에 가세요"와 같은 병원 안내를 씁니다. drugKeywords에는 약국에서 살 수 있는 일반의약품의 효능을 찾을 한국어 증상 키워드(예: 설사, 소화불량, 두통)를 1~3개 넣습니다. 약 이름은 절대 쓰지 않습니다.
- urgent: 생명이 위험할 수 있는 뚜렷한 위험 신호가 있을 때만 고릅니다(예: 가슴 통증과 호흡곤란, 갑자기 닥친 극심한 두통이나 마비·말 어눌함, 의식 저하, 심한 출혈). 열, 두통, 복통, 더부룩함, 설사처럼 흔한 증상이나 그 조합만으로는 urgent를 고르지 말고 question이나 result로 처리합니다. 질문 없이 suspectedCause, 가야 할 진료과(department, 예: 응급의학과), reason을 씁니다.

result에서는 remedies와 drugKeywords를 절대 비우지 않습니다. 쉬운 말로 짧게 씁니다. 해당하지 않는 종류의 항목만 빈 문자열이나 빈 배열로 둡니다.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["question", "result", "urgent"] },
    question: { type: "string" },
    options: { type: "array", items: { type: "string" } },
    suspectedCause: { type: "string" },
    explanation: { type: "string" },
    remedies: { type: "array", items: { type: "string" } },
    whenToSeeDoctor: { type: "string" },
    drugKeywords: { type: "array", items: { type: "string" } },
    department: { type: "string" },
    reason: { type: "string" },
  },
  required: ["kind"],
};

/** Gemini에게 대화를 읽혀 질문, 결과, 긴급 중 하나를 판단하게 한다. */
export function createGeminiAnalyzer(options: {
  client: InteractionsClient;
  model: string;
}): Analyzer {
  return async (messages, { questionsAsked }) => {
    const ask = async (requireComplete: boolean) => {
      const interaction = await options.client.interactions.create({
        model: options.model,
        store: false,
        system_instruction: buildSystemInstruction(questionsAsked),
        input: transcript(messages),
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: RESPONSE_SCHEMA,
        },
      });
      const analysis = parseAnalysis(interaction.output_text);
      if (
        requireComplete &&
        analysis.kind === "result" &&
        (analysis.remedies.length === 0 || analysis.drugKeywords.length === 0)
      ) {
        throw new Error("Gemini 결과에 대처법이나 약 키워드가 없습니다");
      }
      return analysis;
    };

    // 가벼운 모델은 가끔 항목을 빠뜨리거나 recitation 차단으로 실패하므로 한 번만 다시 묻는다.
    try {
      return await ask(true);
    } catch {
      return ask(false);
    }
  };
}

function buildSystemInstruction(questionsAsked: number): string {
  if (questionsAsked < MAX_QUESTIONS) return SYSTEM_INSTRUCTION;
  return `${SYSTEM_INSTRUCTION}\n\n이미 질문을 ${questionsAsked}번 했습니다. 이제 질문하지 말고 가장 유력한 원인으로 result나 urgent를 고르세요.`;
}

function transcript(messages: ChatMessage[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "사용자" : "상담"}: ${m.text}`)
    .join("\n");
}

function parseAnalysis(outputText: string | null | undefined): Analysis {
  if (!outputText) throw new Error("Gemini 응답이 비어 있습니다");
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(outputText) as Record<string, unknown>;
  } catch {
    throw new Error("Gemini 응답이 JSON이 아닙니다");
  }

  if (raw.kind === "question") {
    return {
      kind: "question",
      question: requireText(raw.question, "question"),
      options: texts(raw.options).slice(0, MAX_OPTIONS),
    };
  }
  if (raw.kind === "urgent") {
    return {
      kind: "urgent",
      suspectedCause: requireText(raw.suspectedCause, "suspectedCause"),
      department: requireText(raw.department, "department"),
      reason: requireText(raw.reason, "reason"),
    };
  }
  if (raw.kind === "result") {
    return {
      kind: "result",
      suspectedCause: requireText(raw.suspectedCause, "suspectedCause"),
      explanation: optionalText(raw.explanation),
      remedies: texts(raw.remedies),
      whenToSeeDoctor:
        optionalText(raw.whenToSeeDoctor) || DEFAULT_WHEN_TO_SEE_DOCTOR,
      drugKeywords: texts(raw.drugKeywords),
    };
  }
  throw new Error("Gemini 응답의 kind를 알 수 없습니다");
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Gemini 응답에 ${field}가 없습니다`);
  }
  return value.trim();
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function texts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && !!v.trim());
}

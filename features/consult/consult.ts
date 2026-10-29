import type {
  Analyzer,
  ChatMessage,
  ConsultReply,
  Drug,
  DrugSearch,
} from "./types";

const MAX_DRUGS = 3;

export async function consultTurn(
  messages: ChatMessage[],
  deps: { analyze: Analyzer; searchDrugs: DrugSearch },
): Promise<ConsultReply> {
  const questionsAsked = messages.filter((m) => m.role === "assistant").length;
  const analysis = await deps.analyze(messages, { questionsAsked });

  if (analysis.kind === "question") {
    return {
      kind: "question",
      question: analysis.question,
      options: analysis.options,
    };
  }

  if (analysis.kind === "urgent") {
    return {
      kind: "urgent",
      suspectedCause: analysis.suspectedCause,
      department: analysis.department,
      reason: analysis.reason,
    };
  }

  return {
    kind: "result",
    suspectedCause: analysis.suspectedCause,
    explanation: analysis.explanation,
    remedies: analysis.remedies,
    whenToSeeDoctor: analysis.whenToSeeDoctor,
    drugs: await findDrugs(analysis.drugKeywords, deps.searchDrugs),
  };
}

async function findDrugs(
  keywords: string[],
  searchDrugs: DrugSearch,
): Promise<Drug[]> {
  try {
    const found = await Promise.all(keywords.map((k) => searchDrugs(k)));
    const bySeq = new Map<string, Drug>();
    for (const drug of found.flat()) {
      if (!bySeq.has(drug.itemSeq)) bySeq.set(drug.itemSeq, drug);
    }
    return [...bySeq.values()].slice(0, MAX_DRUGS);
  } catch {
    return [];
  }
}

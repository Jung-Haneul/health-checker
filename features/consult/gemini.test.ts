import { describe, expect, it, vi } from "vitest";

import { createGeminiAnalyzer } from "@/features/consult";

const fakeClient = (outputText: string) => {
  const create = vi.fn<
    (request: Record<string, unknown>) => Promise<{ output_text: string }>
  >(async () => ({ output_text: outputText }));
  return { create, client: { interactions: { create } } };
};

const messages = [
  { role: "user" as const, text: "옆머리가 아프고 윗배가 더부룩해요" },
  { role: "assistant" as const, text: "열이 나나요?" },
  { role: "user" as const, text: "네, 38도예요" },
];

describe("createGeminiAnalyzer", () => {
  it("대화 전체를 보내고 결과 JSON을 원인 분석으로 바꾼다", async () => {
    const { create, client } = fakeClient(
      JSON.stringify({
        kind: "result",
        suspectedCause: "장염",
        explanation: "열과 복부 증상이 함께 있습니다",
        remedies: ["이온음료 마시기"],
        whenToSeeDoctor: "이틀 넘게 낫지 않으면 병원에 가세요",
        drugKeywords: ["설사"],
      }),
    );
    const analyze = createGeminiAnalyzer({ client, model: "test-model" });

    const analysis = await analyze(messages, { questionsAsked: 1 });

    expect(analysis).toEqual({
      kind: "result",
      suspectedCause: "장염",
      explanation: "열과 복부 증상이 함께 있습니다",
      remedies: ["이온음료 마시기"],
      whenToSeeDoctor: "이틀 넘게 낫지 않으면 병원에 가세요",
      drugKeywords: ["설사"],
    });
    const request = create.mock.calls[0][0];
    expect(request.model).toBe("test-model");
    expect(request.store).toBe(false);
    expect(String(request.input)).toContain("옆머리가 아프고 윗배가 더부룩해요");
    expect(String(request.input)).toContain("네, 38도예요");
  });

  it("질문 응답에서 선택지는 4개까지만 쓴다", async () => {
    const { client } = fakeClient(
      JSON.stringify({
        kind: "question",
        question: "어디가 아픈가요?",
        options: ["a", "b", "c", "d", "e"],
      }),
    );
    const analyze = createGeminiAnalyzer({ client, model: "m" });

    const analysis = await analyze(messages.slice(0, 1), { questionsAsked: 0 });

    expect(analysis).toEqual({
      kind: "question",
      question: "어디가 아픈가요?",
      options: ["a", "b", "c", "d"],
    });
  });

  it("질문을 5번 했다면 이번에는 질문하지 말라고 지시한다", async () => {
    const { create, client } = fakeClient(
      JSON.stringify({ kind: "question", question: "q", options: [] }),
    );
    const analyze = createGeminiAnalyzer({ client, model: "m" });

    await analyze(messages, { questionsAsked: 5 });

    const request = create.mock.calls[0][0];
    expect(String(request.system_instruction)).toContain("질문하지 말고");
  });

  it("필수 항목이 계속 빠지면 실패로 알린다", async () => {
    const { create, client } = fakeClient(JSON.stringify({ kind: "result" }));
    const analyze = createGeminiAnalyzer({ client, model: "m" });

    await expect(analyze(messages, { questionsAsked: 1 })).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("결과에 설명과 병원 안내가 빠지면 기본 병원 안내로 채운다", async () => {
    const { client } = fakeClient(
      JSON.stringify({ kind: "result", suspectedCause: "장염" }),
    );
    const analyze = createGeminiAnalyzer({ client, model: "m" });

    const analysis = await analyze(messages, { questionsAsked: 1 });

    expect(analysis).toEqual({
      kind: "result",
      suspectedCause: "장염",
      explanation: "",
      remedies: [],
      whenToSeeDoctor: "증상이 나아지지 않으면 병원에 꼭 가보세요.",
      drugKeywords: [],
    });
  });

  it("결과에 대처법이나 약 키워드가 비어 있으면 한 번 다시 물어 채운다", async () => {
    const { create, client } = fakeClient("");
    create
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          kind: "result",
          suspectedCause: "장염",
          explanation: "e",
          remedies: [],
          whenToSeeDoctor: "병원에 가세요",
          drugKeywords: [],
        }),
      })
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          kind: "result",
          suspectedCause: "장염",
          explanation: "e",
          remedies: ["이온음료 마시기"],
          whenToSeeDoctor: "병원에 가세요",
          drugKeywords: ["설사"],
        }),
      });
    const analyze = createGeminiAnalyzer({ client, model: "m" });

    const analysis = await analyze(messages, { questionsAsked: 1 });

    expect(analysis).toMatchObject({
      remedies: ["이온음료 마시기"],
      drugKeywords: ["설사"],
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("API 호출이 한 번 실패해도 다시 시도해 응답을 받는다", async () => {
    const { create, client } = fakeClient("");
    create
      .mockRejectedValueOnce(new Error("recitation"))
      .mockResolvedValueOnce({
        output_text: JSON.stringify({ kind: "question", question: "q", options: [] }),
      });
    const analyze = createGeminiAnalyzer({ client, model: "m" });

    const analysis = await analyze(messages, { questionsAsked: 0 });

    expect(analysis.kind).toBe("question");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("처음 응답에 필수 항목이 빠져도 한 번 다시 물어 받아낸다", async () => {
    const { create, client } = fakeClient("");
    create
      .mockResolvedValueOnce({ output_text: JSON.stringify({ kind: "result" }) })
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          kind: "urgent",
          suspectedCause: "심근경색",
          department: "응급의학과",
          reason: "즉시 진료가 필요합니다",
        }),
      });
    const analyze = createGeminiAnalyzer({ client, model: "m" });

    const analysis = await analyze(messages, { questionsAsked: 0 });

    expect(analysis.kind).toBe("urgent");
    expect(create).toHaveBeenCalledTimes(2);
  });
});

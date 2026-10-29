import { describe, expect, it, vi } from "vitest";

import { consultTurn } from "@/features/consult";
import type { Analysis, Drug } from "@/features/consult";

const drug = (itemSeq: string): Drug => ({
  itemSeq,
  itemName: `약-${itemSeq}`,
  entpName: "제약사",
  efficacy: "효능",
  useMethod: "사용법",
  caution: "주의사항",
});

const messages = [{ role: "user" as const, text: "윗배가 더부룩해요" }];

describe("consultTurn", () => {
  it("원인 후보가 여럿이면 질문과 선택지를 돌려준다", async () => {
    const analysis: Analysis = {
      kind: "question",
      question: "열이 나나요?",
      options: ["네", "아니요"],
    };

    const reply = await consultTurn(messages, {
      analyze: async () => analysis,
      searchDrugs: async () => [],
    });

    expect(reply).toEqual({
      kind: "question",
      question: "열이 나나요?",
      options: ["네", "아니요"],
    });
  });

  it("원인이 특정되면 효능 키워드로 찾은 약을 중복 없이 최대 3개 붙인다", async () => {
    const searchDrugs = vi.fn(async (keyword: string) =>
      keyword === "설사"
        ? [drug("1"), drug("2"), drug("3")]
        : [drug("3"), drug("4")],
    );

    const reply = await consultTurn(messages, {
      analyze: async () => ({
        kind: "result",
        suspectedCause: "장염",
        explanation: "설명",
        remedies: ["이온음료 마시기"],
        whenToSeeDoctor: "낫지 않으면 병원에 가세요",
        drugKeywords: ["설사", "복통"],
      }),
      searchDrugs,
    });

    expect(searchDrugs).toHaveBeenCalledWith("설사");
    expect(searchDrugs).toHaveBeenCalledWith("복통");
    expect(reply).toMatchObject({
      kind: "result",
      suspectedCause: "장염",
      remedies: ["이온음료 마시기"],
    });
    if (reply.kind !== "result") throw new Error("result 아님");
    expect(reply.drugs.map((d) => d.itemSeq)).toEqual(["1", "2", "3"]);
  });

  it("약 조회가 실패해도 결과는 약 목록을 비운 채 돌려준다", async () => {
    const reply = await consultTurn(messages, {
      analyze: async () => ({
        kind: "result",
        suspectedCause: "장염",
        explanation: "설명",
        remedies: [],
        whenToSeeDoctor: "병원에 가세요",
        drugKeywords: ["설사"],
      }),
      searchDrugs: async () => {
        throw new Error("공공 API 오류");
      },
    });

    expect(reply).toMatchObject({ kind: "result", drugs: [] });
  });

  it("긴급 증상은 약을 조회하지 않고 진료과를 바로 돌려준다", async () => {
    const searchDrugs = vi.fn(async () => [drug("1")]);

    const reply = await consultTurn(messages, {
      analyze: async () => ({
        kind: "urgent",
        suspectedCause: "심근경색",
        department: "응급의학과",
        reason: "가슴 통증과 호흡곤란은 즉시 진료가 필요합니다",
      }),
      searchDrugs,
    });

    expect(searchDrugs).not.toHaveBeenCalled();
    expect(reply).toEqual({
      kind: "urgent",
      suspectedCause: "심근경색",
      department: "응급의학과",
      reason: "가슴 통증과 호흡곤란은 즉시 진료가 필요합니다",
    });
  });

  it("지금까지 한 질문 횟수를 분석기에 알려준다", async () => {
    const analyze = vi.fn(async (): Promise<Analysis> => ({
      kind: "question",
      question: "다음 질문",
      options: [],
    }));

    await consultTurn(
      [
        { role: "user", text: "배가 아파요" },
        { role: "assistant", text: "열이 나나요?" },
        { role: "user", text: "네" },
      ],
      { analyze, searchDrugs: async () => [] },
    );

    expect(analyze).toHaveBeenCalledWith(expect.any(Array), {
      questionsAsked: 1,
    });
  });
});

import { describe, expect, it, vi } from "vitest";

import { createEasyDrugSearch } from "@/features/consult";

const okBody = {
  header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
  body: {
    items: [
      {
        entpName: "동화약품(주)",
        itemName: "활명수",
        itemSeq: "195700020",
        efcyQesitm: "소화불량에 사용합니다.\n",
        useMethodQesitm: "1일 3회 식후에 복용합니다.\n",
        atpnWarnQesitm: null,
        atpnQesitm: "임부는 의사 또는 약사와 상의하십시오.\n",
      },
    ],
  },
};

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

describe("createEasyDrugSearch", () => {
  it("효능 키워드로 e약은요를 조회해 약 정보로 바꿔 돌려준다", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(okBody));
    const search = createEasyDrugSearch({
      serviceKey: "TEST-KEY",
      fetch: fetchMock,
    });

    const drugs = await search("소화불량");

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe(
      "/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList",
    );
    expect(url.searchParams.get("efcyQesitm")).toBe("소화불량");
    expect(url.searchParams.get("type")).toBe("json");
    expect(url.searchParams.get("serviceKey")).toBe("TEST-KEY");
    expect(drugs).toEqual([
      {
        itemSeq: "195700020",
        itemName: "활명수",
        entpName: "동화약품(주)",
        efficacy: "소화불량에 사용합니다.",
        useMethod: "1일 3회 식후에 복용합니다.",
        caution: "임부는 의사 또는 약사와 상의하십시오.",
      },
    ]);
  });

  it("키워드가 효능 설명 앞쪽에 나오는 약을 먼저 돌려준다", async () => {
    const item = (itemSeq: string, efcyQesitm: string) => ({
      itemSeq,
      itemName: `약-${itemSeq}`,
      efcyQesitm,
    });
    const search = createEasyDrugSearch({
      serviceKey: "K",
      fetch: async () =>
        jsonResponse({
          header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
          body: {
            items: [
              item("late", "유당불내증에 의한 소화불량과 설사의 개선에 사용합니다."),
              item("first", "설사의 증상 완화에 사용합니다."),
              item("none", "다른 증상에 사용합니다."),
            ],
          },
        }),
    });

    const drugs = await search("설사");

    expect(drugs.map((d) => d.itemSeq)).toEqual(["first", "late", "none"]);
  });

  it("결과가 없으면 빈 목록을 돌려준다", async () => {
    const search = createEasyDrugSearch({
      serviceKey: "K",
      fetch: async () =>
        jsonResponse({
          header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
          body: { totalCount: 0 },
        }),
    });

    expect(await search("없는증상")).toEqual([]);
  });

  it("공공 API가 오류 코드를 주면 실패로 알린다", async () => {
    const search = createEasyDrugSearch({
      serviceKey: "K",
      fetch: async () =>
        jsonResponse({
          header: { resultCode: "30", resultMsg: "SERVICE KEY IS NOT REGISTERED" },
        }),
    });

    await expect(search("두통")).rejects.toThrow(/SERVICE KEY/);
  });
});

import type { Drug, DrugSearch } from "./types";

const ENDPOINT =
  "https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList";
const ROWS_PER_KEYWORD = 20;
const RESULTS_PER_KEYWORD = 3;

type EasyDrugItem = {
  entpName?: string | null;
  itemName?: string | null;
  itemSeq?: string | null;
  efcyQesitm?: string | null;
  useMethodQesitm?: string | null;
  atpnWarnQesitm?: string | null;
  atpnQesitm?: string | null;
};

type EasyDrugResponse = {
  header?: { resultCode?: string; resultMsg?: string };
  body?: { items?: EasyDrugItem[] };
};

/** 식약처 e약은요 API에서 효능 키워드로 일반의약품을 찾는다. */
export function createEasyDrugSearch(options: {
  serviceKey: string;
  fetch?: typeof fetch;
}): DrugSearch {
  const doFetch = options.fetch ?? fetch;

  return async (keyword) => {
    const url = new URL(ENDPOINT);
    url.searchParams.set("serviceKey", options.serviceKey);
    url.searchParams.set("type", "json");
    url.searchParams.set("numOfRows", String(ROWS_PER_KEYWORD));
    url.searchParams.set("efcyQesitm", keyword);

    const response = await doFetch(url);
    if (!response.ok) throw new Error(`e약은요 HTTP ${response.status}`);

    const data = (await response.json()) as EasyDrugResponse;
    if (data.header?.resultCode !== "00") {
      throw new Error(`e약은요 오류: ${data.header?.resultMsg ?? "알 수 없음"}`);
    }

    return (data.body?.items ?? [])
      .map(toDrug)
      .map((drug) => ({ drug, rank: rankOf(drug.efficacy, keyword) }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, RESULTS_PER_KEYWORD)
      .map(({ drug }) => drug);
  };
}

/** 효능 설명 앞쪽에 키워드가 나올수록 그 증상을 주로 다루는 약으로 본다. */
function rankOf(efficacy: string, keyword: string): number {
  const index = efficacy.indexOf(keyword);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function toDrug(item: EasyDrugItem): Drug {
  const caution = [item.atpnWarnQesitm, item.atpnQesitm]
    .map(clean)
    .filter(Boolean)
    .join("\n");

  return {
    itemSeq: clean(item.itemSeq),
    itemName: clean(item.itemName),
    entpName: clean(item.entpName),
    efficacy: clean(item.efcyQesitm),
    useMethod: clean(item.useMethodQesitm),
    caution,
  };
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

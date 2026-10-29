import { GoogleGenAI } from "@google/genai";

import {
  consultTurn,
  createEasyDrugSearch,
  createGeminiAnalyzer,
} from "@/features/consult";
import type { ChatMessage } from "@/features/consult";

const MODEL = "gemini-3.5-flash-lite";
const GEMINI_TIMEOUT_MS = 30_000;
const MAX_MESSAGES = 30;
const MAX_TEXT_LENGTH = 1000;

export async function POST(request: Request) {
  const messages = parseMessages(await request.json().catch(() => null));
  if (!messages) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const drugKey = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!geminiKey || !drugKey) {
    return Response.json(
      { error: "서버에 API 키가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  try {
    const client = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: { timeout: GEMINI_TIMEOUT_MS },
    });
    const reply = await consultTurn(messages, {
      analyze: createGeminiAnalyzer({
        client: client as Parameters<typeof createGeminiAnalyzer>[0]["client"],
        model: MODEL,
      }),
      searchDrugs: createEasyDrugSearch({ serviceKey: drugKey }),
    });
    return Response.json(reply);
  } catch (error) {
    console.error("[consult] 상담 처리 실패", error);
    return Response.json(
      { error: "상담 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}

function parseMessages(body: unknown): ChatMessage[] | null {
  const list = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_MESSAGES) {
    return null;
  }

  const messages: ChatMessage[] = [];
  for (const item of list) {
    const { role, text } = (item ?? {}) as Record<string, unknown>;
    if (
      (role !== "user" && role !== "assistant") ||
      typeof text !== "string" ||
      !text.trim() ||
      text.length > MAX_TEXT_LENGTH
    ) {
      return null;
    }
    messages.push({ role, text: text.trim() });
  }
  return messages.at(-1)?.role === "user" ? messages : null;
}

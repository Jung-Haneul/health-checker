"use client";

import { useRef, useState } from "react";
import { AlertTriangleIcon, SendIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import type { ChatMessage, ConsultReply } from "./types";

type Entry =
  | { type: "user"; text: string }
  | { type: "reply"; reply: ConsultReply };

type Status = "idle" | "loading" | "error";

export function ConsultPanel() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const lastReply = [...entries]
    .reverse()
    .find((e): e is Extract<Entry, { type: "reply" }> => e.type === "reply");
  const finished =
    lastReply?.reply.kind === "result" || lastReply?.reply.kind === "urgent";
  const awaitingReply = entries.at(-1)?.type === "user";
  const busy = status === "loading";

  async function request(history: ChatMessage[]) {
    setStatus("loading");
    try {
      const response = await fetch("/api/consult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "요청에 실패했습니다.");

      const reply = data as ConsultReply;
      setEntries((prev) => [...prev, { type: "reply", reply }]);
      if (reply.kind === "question") {
        setMessages([...history, { role: "assistant", text: reply.question }]);
      }
      setStatus("idle");
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : "요청에 실패했습니다.",
      );
      setStatus("error");
    } finally {
      queueMicrotask(() =>
        bottomRef.current?.scrollIntoView?.({ behavior: "smooth" }),
      );
    }
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || finished) return;
    const history: ChatMessage[] = [...messages, { role: "user", text: trimmed }];
    setEntries((prev) => [...prev, { type: "user", text: trimmed }]);
    setMessages(history);
    setDraft("");
    void request(history);
  }

  function reset() {
    setEntries([]);
    setMessages([]);
    setDraft("");
    setStatus("idle");
    setErrorText("");
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-1 flex-col gap-4">
        {entries.length === 0 && (
          <p className="text-muted-foreground">
            어디가 어떻게 아픈지 편하게 적어 주세요. 예: 옆머리가 아프고 윗배가
            더부룩해요.
          </p>
        )}

        {entries.map((entry, index) =>
          entry.type === "user" ? (
            <div key={index} className="flex justify-end">
              <p className="max-w-[85%] rounded-xl bg-primary px-3 py-2 text-primary-foreground">
                {entry.text}
              </p>
            </div>
          ) : (
            <ReplyView
              key={index}
              reply={entry.reply}
              isLatest={index === entries.length - 1}
              disabled={busy}
              onAnswer={send}
            />
          ),
        )}

        {busy && (
          <p role="status" className="text-muted-foreground">
            증상을 살펴보는 중입니다…
          </p>
        )}

        {status === "error" && (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertTitle>상담을 이어가지 못했습니다</AlertTitle>
            <AlertDescription>
              <p>{errorText}</p>
              <Button
                className="mt-2"
                variant="outline"
                size="sm"
                onClick={() => void request(messages)}
              >
                다시 시도
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t bg-background px-4 pt-3 pb-4">
        <p className="text-xs text-muted-foreground">
          입력한 내용이 구글의 서비스 개선에 쓰일 수 있으니 이름·연락처 같은
          개인정보는 적지 마세요. 이 서비스는 의사가 아니며 확정 진단이
          아닙니다.
        </p>
        {finished ? (
          <>
            <Textarea
              aria-label="증상"
              disabled
              rows={2}
              placeholder="상담이 끝났습니다"
            />
            <Button variant="outline" onClick={reset}>
              새 상담 시작
            </Button>
          </>
        ) : (
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
          >
            <Textarea
              aria-label="증상"
              rows={2}
              value={draft}
              disabled={busy}
              placeholder={
                awaitingReply || messages.length > 0
                  ? "답을 직접 적어도 됩니다"
                  : "증상을 적어 주세요"
              }
              maxLength={1000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  send(draft);
                }
              }}
            />
            <Button type="submit" disabled={busy || !draft.trim()}>
              <SendIcon data-icon="inline-start" />
              보내기
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function ReplyView({
  reply,
  isLatest,
  disabled,
  onAnswer,
}: {
  reply: ConsultReply;
  isLatest: boolean;
  disabled: boolean;
  onAnswer: (text: string) => void;
}) {
  if (reply.kind === "question") {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="max-w-[85%] rounded-xl bg-muted px-3 py-2">
          {reply.question}
        </p>
        {isLatest && reply.options.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {reply.options.map((option) => (
              <Button
                key={option}
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => onAnswer(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (reply.kind === "urgent") {
    return (
      <Alert variant="destructive">
        <AlertTriangleIcon />
        <AlertTitle>
          {withSubject(reply.suspectedCause)} 의심됩니다. 지금 바로{" "}
          {reply.department}에 가보세요
        </AlertTitle>
        <AlertDescription>{reply.reason}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>{withSubject(reply.suspectedCause)} 의심됩니다</span>
          <Badge variant="secondary">확정 진단 아님</Badge>
        </CardTitle>
        {reply.explanation && (
          <CardDescription>{reply.explanation}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {reply.remedies.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-sm font-semibold">대처법</h2>
            <ul className="list-disc pl-5">
              {reply.remedies.map((remedy) => (
                <li key={remedy}>{remedy}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-sm font-semibold">
            약국에서 살 수 있는 약
          </h2>
          {reply.drugs.length === 0 ? (
            <p className="text-muted-foreground">
              알려드릴 약을 찾지 못했습니다. 약국에서 상담하세요.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {reply.drugs.map((drug) => (
                <li key={drug.itemSeq} className="rounded-lg border p-3">
                  <p className="font-medium">{drug.itemName}</p>
                  <p className="text-xs text-muted-foreground">
                    {drug.entpName}
                  </p>
                  <dl className="mt-2 flex flex-col gap-1 text-sm">
                    <div>
                      <dt className="font-medium">효능</dt>
                      <dd>{drug.efficacy}</dd>
                    </div>
                    <div>
                      <dt className="font-medium">사용법</dt>
                      <dd>{drug.useMethod}</dd>
                    </div>
                    <div>
                      <dt className="font-medium">주의사항</dt>
                      <dd className="whitespace-pre-line">{drug.caution}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-sm text-muted-foreground">{reply.whenToSeeDoctor}</p>
      </CardContent>
    </Card>
  );
}

/** "장염" → "장염이", "감기" → "감기가" */
function withSubject(word: string): string {
  const last = word.trim().at(-1);
  if (!last) return word;
  const code = last.charCodeAt(0);
  const isHangul = code >= 0xac00 && code <= 0xd7a3;
  const hasFinal = isHangul && (code - 0xac00) % 28 !== 0;
  return `${word}${hasFinal || !isHangul ? "이" : "가"}`;
}

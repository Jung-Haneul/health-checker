import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConsultPanel } from "@/features/consult";
import type { ConsultReply } from "@/features/consult";

const reply = (body: ConsultReply) =>
  new Response(JSON.stringify(body), { status: 200 });

const mockFetch = (...responses: Response[]) => {
  const fetchMock = vi.fn();
  for (const r of responses) fetchMock.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const sentMessages = (fetchMock: ReturnType<typeof vi.fn>, call: number) =>
  JSON.parse(fetchMock.mock.calls[call][1].body).messages;

const result: ConsultReply = {
  kind: "result",
  suspectedCause: "장염",
  explanation: "열과 복부 증상이 함께 있습니다",
  remedies: ["이온음료 마시기"],
  whenToSeeDoctor: "낫지 않으면 병원에 꼭 가보세요",
  drugs: [
    {
      itemSeq: "1",
      itemName: "활명수",
      entpName: "동화약품(주)",
      efficacy: "소화불량에 사용합니다.",
      useMethod: "1일 3회 식후에 복용합니다.",
      caution: "임부는 약사와 상의하십시오.",
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("ConsultPanel", () => {
  it("처음부터 개인정보 고지와 확정 진단 아님 고지를 보여준다", () => {
    render(<ConsultPanel />);

    expect(screen.getByText(/구글의 서비스 개선에 쓰일 수 있/)).toBeVisible();
    expect(screen.getByText(/개인정보는 적지 마세요/)).toBeVisible();
    expect(screen.getByText(/의사가 아니며 확정 진단이 아닙니다/)).toBeVisible();
  });

  it("증상을 보내면 질문이 나오고, 선택지를 누르면 결과와 약이 나온다", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(
      reply({ kind: "question", question: "열이 나나요?", options: ["네", "아니요"] }),
      reply(result),
    );
    render(<ConsultPanel />);

    await user.type(screen.getByLabelText("증상"), "윗배가 더부룩해요");
    await user.click(screen.getByRole("button", { name: "보내기" }));

    expect(await screen.findByText("열이 나나요?")).toBeVisible();
    expect(sentMessages(fetchMock, 0)).toEqual([
      { role: "user", text: "윗배가 더부룩해요" },
    ]);

    await user.click(screen.getByRole("button", { name: "네" }));

    expect(await screen.findByText(/장염이 의심됩니다/)).toBeVisible();
    expect(sentMessages(fetchMock, 1)).toEqual([
      { role: "user", text: "윗배가 더부룩해요" },
      { role: "assistant", text: "열이 나나요?" },
      { role: "user", text: "네" },
    ]);
    expect(screen.getByText("이온음료 마시기")).toBeVisible();
    expect(screen.getByText(/낫지 않으면 병원에 꼭 가보세요/)).toBeVisible();
    expect(screen.getByText("활명수")).toBeVisible();
    expect(screen.getByText(/1일 3회 식후에 복용합니다/)).toBeVisible();
    expect(screen.getByText(/임부는 약사와 상의하십시오/)).toBeVisible();
    expect(screen.getByLabelText("증상")).toBeDisabled();
  });

  it("약을 찾지 못하면 약국 상담 안내를 보여주고 약 이름은 만들지 않는다", async () => {
    const user = userEvent.setup();
    mockFetch(reply({ ...result, drugs: [] } as ConsultReply));
    render(<ConsultPanel />);

    await user.type(screen.getByLabelText("증상"), "배가 아파요");
    await user.click(screen.getByRole("button", { name: "보내기" }));

    expect(await screen.findByText(/약국에서 상담하세요/)).toBeVisible();
    expect(screen.queryByText("활명수")).not.toBeInTheDocument();
  });

  it("긴급 증상이면 진료과와 이유를 바로 보여준다", async () => {
    const user = userEvent.setup();
    mockFetch(
      reply({
        kind: "urgent",
        suspectedCause: "심근경색",
        department: "응급의학과",
        reason: "지금 바로 진료가 필요합니다",
      }),
    );
    render(<ConsultPanel />);

    await user.type(screen.getByLabelText("증상"), "가슴이 아프고 숨쉬기 힘들어요");
    await user.click(screen.getByRole("button", { name: "보내기" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/응급의학과/)).toBeVisible();
    expect(within(alert).getByText(/지금 바로 진료가 필요합니다/)).toBeVisible();
    expect(within(alert).getByText(/심근경색이 의심됩니다/)).toBeVisible();
  });

  it("호출이 실패하면 오류를 보여주고, 대화를 유지한 채 다시 시도할 수 있다", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(
      new Response(JSON.stringify({ error: "상담 응답을 받지 못했습니다." }), {
        status: 502,
      }),
      reply(result),
    );
    render(<ConsultPanel />);

    await user.type(screen.getByLabelText("증상"), "윗배가 더부룩해요");
    await user.click(screen.getByRole("button", { name: "보내기" }));

    expect(await screen.findByText(/상담 응답을 받지 못했습니다/)).toBeVisible();
    expect(screen.getByText("윗배가 더부룩해요")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText(/장염이 의심됩니다/)).toBeVisible();
    expect(sentMessages(fetchMock, 1)).toEqual(sentMessages(fetchMock, 0));
  });

  it("새 상담 시작을 누르면 대화가 비워지고 다시 입력할 수 있다", async () => {
    const user = userEvent.setup();
    mockFetch(reply(result));
    render(<ConsultPanel />);

    await user.type(screen.getByLabelText("증상"), "배가 아파요");
    await user.click(screen.getByRole("button", { name: "보내기" }));
    await screen.findByText(/장염이 의심됩니다/);

    await user.click(screen.getByRole("button", { name: "새 상담 시작" }));

    await waitFor(() =>
      expect(screen.queryByText(/장염이 의심됩니다/)).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("증상")).toBeEnabled();
  });
});

import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import Home from "@/app/page";

test("홈 화면은 증상 상담 제목과 증상 입력창을 보여준다", () => {
  render(<Home />);

  expect(
    screen.getByRole("heading", { level: 1, name: "증상 상담" })
  ).toBeInTheDocument();
  expect(screen.getByLabelText("증상")).toBeInTheDocument();
});

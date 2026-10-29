export type ChatMessage = { role: "user" | "assistant"; text: string };

export type Drug = {
  itemSeq: string;
  itemName: string;
  entpName: string;
  efficacy: string;
  useMethod: string;
  caution: string;
};

/** LLM이 대화를 읽고 내리는 판단. 약 정보는 담지 않는다. */
export type Analysis =
  | { kind: "question"; question: string; options: string[] }
  | {
      kind: "result";
      suspectedCause: string;
      explanation: string;
      remedies: string[];
      whenToSeeDoctor: string;
      drugKeywords: string[];
    }
  | {
      kind: "urgent";
      suspectedCause: string;
      department: string;
      reason: string;
    };

/** 사용자에게 돌려주는 한 번의 상담 응답. */
export type ConsultReply =
  | { kind: "question"; question: string; options: string[] }
  | {
      kind: "result";
      suspectedCause: string;
      explanation: string;
      remedies: string[];
      whenToSeeDoctor: string;
      drugs: Drug[];
    }
  | {
      kind: "urgent";
      suspectedCause: string;
      department: string;
      reason: string;
    };

export type Analyzer = (
  messages: ChatMessage[],
  context: { questionsAsked: number },
) => Promise<Analysis>;

export type DrugSearch = (keyword: string) => Promise<Drug[]>;

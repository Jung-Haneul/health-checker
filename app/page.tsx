import { ConsultPanel } from "@/features/consult";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pt-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">
          증상 상담
        </h1>
        <p className="text-muted-foreground">
          증상을 말하면 의심되는 원인과 대처법, 약국에서 살 수 있는 약을
          알려드립니다.
        </p>
      </header>
      <ConsultPanel />
    </main>
  );
}

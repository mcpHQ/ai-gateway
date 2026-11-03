import Link from "next/link";
import { accountExists } from "@/lib/account";

export const dynamic = "force-dynamic";

const snippet = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: "http://localhost:3000/v1",
});

const response = await client.chat.completions.create({
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: "Hello" }],
});`;

export default async function HomePage() {
  const hasAccount = await accountExists();
  return (
    <main>
      <section className="hero-grid border-y border-border">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-3 text-sm font-medium text-brand-foreground">Open source AI gateway</p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">One API for every model provider.</h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              Point any OpenAI SDK at the gateway. It routes across OpenAI, Anthropic, and compatible providers, fails over
              when a provider errors, and records tokens, cost, and latency.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={hasAccount ? "/login" : "/signup"} className="btn-primary px-4 py-2.5">
                {hasAccount ? "Sign in" : "Open the gateway"}
              </Link>
              {hasAccount ? null : (
                <Link href="/login" className="btn-secondary px-4 py-2.5">
                  Sign in
                </Link>
              )}
            </div>
          </div>
          <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-[#141a2b] p-5 text-sm leading-6 text-[#edf1fb] shadow-2xl shadow-brand/20">
            <code>{snippet}</code>
          </pre>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-3">
        {[
          {
            title: "Routing and fallbacks",
            body: "Try providers in priority order, retry once on 429 and 5xx, then move to the next model.",
          },
          {
            title: "Cache, limits, and budgets",
            body: "Serve identical non-streaming responses from cache, cap requests per minute, and stop keys or workspaces that pass a monthly budget.",
          },
          {
            title: "Request logs",
            body: "Every chat and embedding call records the winning provider, attempts, tokens, cost, latency, and whether the cache hit.",
          },
        ].map((item) => (
          <article key={item.title} className="panel p-6">
            <h2 className="text-lg font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
          </article>
        ))}
      </section>
      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted-foreground">
        Self-host with Docker Compose. Clients keep using the OpenAI SDK against <code>/v1</code>.
      </footer>
    </main>
  );
}

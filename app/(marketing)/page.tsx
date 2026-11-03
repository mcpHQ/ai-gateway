import Link from "next/link";
import { accountExists } from "@/lib/account";

export const dynamic = "force-dynamic";

const providers = [
  { name: "OpenAI", logo: "openai" },
  { name: "Anthropic", logo: "anthropic" },
  { name: "Gemini", logo: "gemini" },
  { name: "OpenAI-compatible", logo: "compatible" },
] as const;

const path = [
  { step: "01", title: "The SDK calls /v1", body: "Chat, Responses, embeddings, models, or Anthropic Messages. One gateway key." },
  { step: "02", title: "Limits and checks", body: "Budget, rate limit, and threat detection run before a provider is contacted." },
  { step: "03", title: "Cache, then route", body: "An exact hit returns immediately. A miss tries providers in priority order." },
  { step: "04", title: "The call is logged", body: "Provider, attempts, tokens, cost, latency, and cache result land on the request log." },
];

export default async function HomePage() {
  const hasAccount = await accountExists();
  const start = hasAccount ? "/login" : "/signup";

  return (
    <main>
      <section className="hero-grid border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div>
            <p className="text-sm font-medium text-brand-foreground">Open source · self-hosted · your provider keys</p>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl sm:leading-[1.05]">
              One base URL for every model provider.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
              Keep the OpenAI or Anthropic SDK. Change the base URL. The gateway stores your keys, fails over when a provider errors, and records what each call cost.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={start} className="btn-primary px-4 py-2.5">
                {hasAccount ? "Sign in" : "Open the gateway"}
              </Link>
              <a href="#deploy" className="btn-secondary px-4 py-2.5">
                Self-host
              </a>
            </div>
          </div>
          <Snippet />
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Bring your own keys</span>
          {providers.map((provider) => (
            <span key={provider.name} className="inline-flex items-center gap-2">
              <ProviderLogo name={provider.logo} />
              {provider.name}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">How a request moves</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {path.map((item) => (
            <li key={item.step} className="panel p-5">
              <div className="font-mono text-xs text-brand-foreground">{item.step}</div>
              <h3 className="mt-3 font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="routing" className="scroll-mt-20 border-t border-border bg-white/70">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Failover without a rewrite.</h2>
            <p className="mt-4 text-muted-foreground leading-7">
              Providers of the matching type are tried in priority order. Each one is retried once on HTTP 429, HTTP 5xx, or a timeout. Any other 4xx stops the chain. A fallback model can be set on the request, or once for the gateway.
            </p>
            <p className="mt-3 text-muted-foreground leading-7">
              Messages calls that fall over to another provider become chat completions. Responses calls become Messages. The <code className="rounded bg-muted px-1">gateway</code> object is removed before the upstream call.
            </p>
          </div>
          <div className="panel p-5">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">openai/gpt-4o-mini</div>
            <ul className="mt-4 space-y-3 text-sm">
              <RouteRow name="OpenAI" detail="priority 0 · HTTP 503" state="failed" />
              <RouteRow name="OpenAI" detail="retry · timeout" state="failed" />
              <RouteRow name="Compatible" detail="priority 10 · HTTP 200" state="ok" />
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">Response headers include the provider, model, and attempt that answered.</p>
          </div>
        </div>
      </section>

      <section id="spend" className="scroll-mt-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center">
          <div className="panel order-2 p-5 lg:order-1">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Example · this month</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">$42.18</div>
              </div>
              <div className="text-right text-sm text-muted-foreground">1,284 requests</div>
            </div>
            <ul className="mt-5 space-y-3 text-sm">
              <SpendRow model="openai/gpt-4o-mini" value="$28.40" />
              <SpendRow model="anthropic/claude-haiku-4-5" value="$9.12" />
              <SpendRow model="gemini/gemini-3.5-flash" value="$4.66" />
            </ul>
          </div>
          <div className="order-1 lg:order-2">
            <h2 className="text-3xl font-semibold tracking-tight">Spend, cache, and limits in one place.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Every proxied call records tokens, cost, latency, the winning provider, and whether the cache hit. Exact matches are free and never reach a provider. A monthly budget returns 402. A per-key rate limit returns 429 with Retry-After.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              <Mini title="Exact and semantic cache" body="Semantic lookup runs after an exact miss, above the similarity you set." />
              <Mini title="Prompt cache" body="Anthropic requests can be marked for prefix caching. OpenAI and Gemini stay unchanged." />
            </ul>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-white/70">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Stop a bad prompt before it is billed.</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Each gateway flags, blocks, or skips the check. Instruction-override phrasing, payment card numbers, and secrets from secretlint&apos;s recommended rules are recorded as codes. The matched secret is not written to the log.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            <GuardCard title="Flag" body="The call continues. The response says x-ai-gateway-guard: flag." />
            <GuardCard title="Block" body="HTTP 403. The provider is never called." />
            <GuardCard title="Off" body="The prompt is not inspected." />
          </ul>
        </div>
      </section>

      <section id="deploy" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Run it where the keys live.</h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">Provider credentials are encrypted at rest. One installation has one account. A workspace can hold several gateways, each with its own keys, budget, cache, and log.</p>
            </div>
            <Link href={start} className="btn-primary px-4 py-2.5">
              {hasAccount ? "Sign in" : "Create the account"}
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="https://render.com/deploy?repo=https://github.com/mcpHQ/ai-gateway">
              <img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" className="h-10" />
            </a>
            <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2FmcpHQ%2Fai-gateway&plugins=postgresql&envs=DATABASE_URL%2CBETTER_AUTH_URL%2CBETTER_AUTH_SECRET%2CENCRYPTION_KEY&DATABASE_URLDefault=%24%7B%7B%20DATABASE_URL%20%7D%7D&DATABASE_URLDesc=Provided%20by%20Postgres.%20Leave%20this%20value.&BETTER_AUTH_URLDefault=https%3A%2F%2F%24%7B%7B%20RAILWAY_PUBLIC_DOMAIN%20%7D%7D&BETTER_AUTH_URLDesc=Public%20origin%20for%20sign-in.%20Leave%20the%20default.&BETTER_AUTH_SECRETDesc=A%20long%20random%20string.&ENCRYPTION_KEYDesc=64%20hex%20characters%20from%20openssl%20rand%20-hex%2032">
              <img src="https://railway.com/button.svg" alt="Deploy on Railway" className="h-10" />
            </a>
            <a href="https://github.com/mcpHQ/ai-gateway/blob/main/docker-compose.coolify.yml" className="btn-secondary h-10 px-4">
              Deploy on Coolify
            </a>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Command
              title="Docker Compose"
              command={"# .env next to docker-compose.yml\nBETTER_AUTH_URL=https://gateway.example.com\n\ndocker compose up --build"}
              note="That value is the public origin for sign-in cookies. Leave it unset to use http://localhost:3000. A proxy in front of port 3000 must serve the same origin."
            />
            <Command
              title="Kubernetes"
              command={"helm upgrade --install ai-gateway charts/ai-gateway \\\n  --set image.tag=main \\\n  --set auth.url=https://gateway.example.com"}
              note="auth.url is the same setting as BETTER_AUTH_URL. The chart can start Postgres, or use a database you already run."
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Apache-2.0</span>
          <a href="https://github.com/mcpHQ/ai-gateway" className="hover:text-foreground">
            github.com/mcpHQ/ai-gateway
          </a>
        </div>
      </footer>
    </main>
  );
}

function Snippet() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#242b40] bg-[#141a2b] shadow-2xl shadow-brand/20">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-2 font-mono text-xs text-white/50">client.mjs</span>
      </div>
      <pre className="overflow-x-auto px-5 py-5 text-[13px] leading-6 text-[#edf1fb]">
        <code>
          <Line>
            <Kw>import</Kw> OpenAI <Kw>from</Kw> <Str>&quot;openai&quot;</Str>;
          </Line>
          <Line />
          <Line>
            <Kw>const</Kw> client = <Kw>new</Kw> <Fn>OpenAI</Fn>({"{"}
          </Line>
          <Line>
            {"  "}apiKey: process.env.AI_GATEWAY_API_KEY,
          </Line>
          <Line>
            {"  "}baseURL: <Str>&quot;https://gateway.example.com/v1&quot;</Str>,
          </Line>
          <Line>{"}"});</Line>
        </code>
      </pre>
      <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3 font-mono text-[11px] text-white/70">
        <span className="rounded-md bg-white/10 px-2 py-1">x-ai-gateway-provider: openai</span>
        <span className="rounded-md bg-white/10 px-2 py-1">x-ai-gateway-cache: MISS</span>
        <span className="rounded-md bg-white/10 px-2 py-1">attempt 1</span>
      </div>
    </div>
  );
}

function ProviderLogo({ name }: { name: (typeof providers)[number]["logo"] }) {
  if (name === "compatible") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          d="M8 8h4a4 4 0 0 1 0 8H8m8-8h-1.5A4 4 0 0 0 12 12m0 0a4 4 0 0 0 2.5 4H16"
        />
      </svg>
    );
  }
  const src = { openai: "/logos/openai.svg", anthropic: "/logos/anthropic.svg", gemini: "/logos/gemini.svg" }[name];
  return <img src={src} alt="" className="h-5 w-5 shrink-0 object-contain" />;
}

function Line({ children }: { children?: React.ReactNode }) {
  return <div className="whitespace-pre">{children}</div>;
}

function Kw({ children }: { children: string }) {
  return <span className="text-[#c4b5fd]">{children}</span>;
}

function Str({ children }: { children: string }) {
  return <span className="text-[#86efac]">{children}</span>;
}

function Fn({ children }: { children: string }) {
  return <span className="text-[#93c5fd]">{children}</span>;
}

function RouteRow({ name, detail, state }: { name: string; detail: string; state: "failed" | "ok" }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-xl bg-muted/80 px-4 py-3">
      <span>
        <span className="font-medium">{name}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
      </span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${state === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
        {state === "ok" ? "Served" : "Failed"}
      </span>
    </li>
  );
}

function SpendRow({ model, value }: { model: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-4">
      <span className="truncate font-medium">{model}</span>
      <span className="text-muted-foreground">{value}</span>
    </li>
  );
}

function Mini({ title, body }: { title: string; body: string }) {
  return (
    <li className="rounded-xl bg-muted/80 px-4 py-3">
      <div className="font-medium">{title}</div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
    </li>
  );
}

function GuardCard({ title, body }: { title: string; body: string }) {
  return (
    <li className="panel p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </li>
  );
}

function Command({ title, command, note }: { title: string; command: string; note: string }) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-border px-5 py-3 text-sm font-medium">{title}</div>
      <pre className="overflow-x-auto bg-[#141a2b] px-5 py-4 text-sm leading-6 text-[#edf1fb]">
        <code>{command}</code>
      </pre>
      <p className="px-5 py-3 text-sm text-muted-foreground">{note}</p>
    </div>
  );
}

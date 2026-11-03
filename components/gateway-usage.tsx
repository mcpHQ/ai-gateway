"use client";

import { useState } from "react";

const clients = [
  { id: "curl", label: "curl", brand: "curl", languages: [] },
  { id: "openai", label: "OpenAI", brand: "openai", languages: ["JavaScript", "Python", "Go"] },
  { id: "anthropic", label: "Anthropic", brand: "anthropic", languages: ["JavaScript", "Python", "Go"] },
  { id: "gemini", label: "Gemini", brand: "gemini", languages: ["JavaScript", "Python", "Go"] },
  { id: "vercel", label: "Vercel AI SDK", brand: "vercel", languages: ["JavaScript"] },
  { id: "langchain", label: "LangChain", brand: "langchain", languages: ["JavaScript", "Python", "Go"] },
] as const;

type ClientId = (typeof clients)[number]["id"];
type Language = "JavaScript" | "Python" | "Go";

export function GatewayUsage({ origin, gatewayName }: { origin: string; gatewayName: string }) {
  const [copied, setCopied] = useState("");
  const [client, setClient] = useState<ClientId>("curl");
  const [language, setLanguage] = useState<Language>("JavaScript");
  const baseUrl = `${origin}/v1`;
  const selected = clients.find((item) => item.id === client) ?? clients[0];
  const languages = selected.languages as readonly Language[];
  const activeLanguage = languages.includes(language) ? language : (languages[0] ?? "JavaScript");
  const snippet = snippets(origin, baseUrl)[client][activeLanguage] ?? snippets(origin, baseUrl)[client].JavaScript;

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1500);
  }

  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight">Use {gatewayName}</h2>
      <ol className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
        <li className="rounded-xl bg-muted px-3 py-2">1. Copy the base URL.</li>
        <li className="rounded-xl bg-muted px-3 py-2">2. Create an API key. It is shown once.</li>
        <li className="rounded-xl bg-muted px-3 py-2">3. Use the gateway key, not the provider key.</li>
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl border border-border bg-muted px-3 py-2.5 text-sm">{baseUrl}</code>
        <button type="button" onClick={() => copy(baseUrl, "url")} className="btn-secondary">
          {copied === "url" ? "Copied" : "Copy URL"}
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {clients.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setClient(item.id)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
              client === item.id
                ? "border-brand/30 bg-brand/10 font-medium text-brand-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted"
            }`}
          >
            <BrandIcon brand={item.brand} />
            {item.label}
          </button>
        ))}
        {selected.languages.length > 1 ? (
          <div className="ml-auto flex rounded-full border border-border bg-muted p-0.5 text-sm">
            {languages.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setLanguage(item)}
                className={`rounded-full px-2.5 py-1 ${activeLanguage === item ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="relative mt-4">
        <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-[#141a2b] p-4 pr-24 text-xs leading-5 text-[#edf1fb]">
          <code>{snippet}</code>
        </pre>
        <button
          type="button"
          onClick={() => copy(snippet, "snippet")}
          className="absolute top-3 right-3 rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white hover:bg-white/20"
        >
          {copied === "snippet" ? "Copied" : "Copy"}
        </button>
      </div>
    </section>
  );
}

function snippets(origin: string, baseUrl: string): Record<ClientId, Partial<Record<Language, string>> & { JavaScript: string }> {
  return {
    curl: {
      JavaScript: `curl ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer $AI_GATEWAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-4o-mini",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'`,
    },
    openai: {
      JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: "${baseUrl}",
});

const response = await client.chat.completions.create({
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: "Hello" }],
});`,
      Python: `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.environ["AI_GATEWAY_API_KEY"],
    base_url="${baseUrl}",
)

response = client.chat.completions.create(
    model="openai/gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}],
)`,
      Go: `package main

import (
	"context"
	"os"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

func main() {
	client := openai.NewClient(
		option.WithAPIKey(os.Getenv("AI_GATEWAY_API_KEY")),
		option.WithBaseURL("${baseUrl}/"),
	)
	response, err := client.Chat.Completions.New(context.Background(), openai.ChatCompletionNewParams{
		Model: "openai/gpt-4o-mini",
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.UserMessage("Hello"),
		},
	})
	if err != nil {
		panic(err)
	}
	println(response.Choices[0].Message.Content)
}`,
    },
    anthropic: {
      JavaScript: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: "${origin}",
});

const response = await client.messages.create({
  model: "anthropic/claude-haiku-4-5",
  max_tokens: 256,
  messages: [{ role: "user", content: "Hello" }],
});`,
      Python: `import os
import anthropic

client = anthropic.Anthropic(
    api_key=os.environ["AI_GATEWAY_API_KEY"],
    base_url="${origin}",
)

response = client.messages.create(
    model="anthropic/claude-haiku-4-5",
    max_tokens=256,
    messages=[{"role": "user", "content": "Hello"}],
)`,
      Go: `package main

import (
	"context"
	"os"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

func main() {
	client := anthropic.NewClient(
		option.WithAPIKey(os.Getenv("AI_GATEWAY_API_KEY")),
		option.WithBaseURL("${origin}"),
	)
	response, err := client.Messages.New(context.Background(), anthropic.MessageNewParams{
		Model:     "anthropic/claude-haiku-4-5",
		MaxTokens: 256,
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock("Hello")),
		},
	})
	if err != nil {
		panic(err)
	}
	println(response.Content[0].Text)
}`,
    },
    gemini: {
      JavaScript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: "${baseUrl}",
});

const response = await client.chat.completions.create({
  model: "gemini/gemini-3.5-flash",
  messages: [{ role: "user", content: "Hello" }],
});`,
      Python: `from openai import OpenAI
import os

client = OpenAI(
    api_key=os.environ["AI_GATEWAY_API_KEY"],
    base_url="${baseUrl}",
)

response = client.chat.completions.create(
    model="gemini/gemini-3.5-flash",
    messages=[{"role": "user", "content": "Hello"}],
)`,
      Go: `package main

import (
	"context"
	"os"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

func main() {
	client := openai.NewClient(
		option.WithAPIKey(os.Getenv("AI_GATEWAY_API_KEY")),
		option.WithBaseURL("${baseUrl}/"),
	)
	response, err := client.Chat.Completions.New(context.Background(), openai.ChatCompletionNewParams{
		Model: "gemini/gemini-3.5-flash",
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.UserMessage("Hello"),
		},
	})
	if err != nil {
		panic(err)
	}
	println(response.Choices[0].Message.Content)
}`,
    },
    vercel: {
      JavaScript: `import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: "${baseUrl}",
});

const { text } = await generateText({
  model: openai("openai/gpt-4o-mini"),
  prompt: "Hello",
});`,
    },
    langchain: {
      JavaScript: `import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  model: "openai/gpt-4o-mini",
  apiKey: process.env.AI_GATEWAY_API_KEY,
  configuration: {
    baseURL: "${baseUrl}",
  },
});

const response = await model.invoke("Hello");`,
      Python: `import os
from langchain_openai import ChatOpenAI

model = ChatOpenAI(
    model="openai/gpt-4o-mini",
    api_key=os.environ["AI_GATEWAY_API_KEY"],
    base_url="${baseUrl}",
)

response = model.invoke("Hello")`,
      Go: `package main

import (
	"context"
	"os"

	"github.com/tmc/langchaingo/llms/openai"
)

func main() {
	model, err := openai.New(
		openai.WithToken(os.Getenv("AI_GATEWAY_API_KEY")),
		openai.WithBaseURL("${baseUrl}"),
		openai.WithModel("openai/gpt-4o-mini"),
	)
	if err != nil {
		panic(err)
	}
	response, err := model.Call(context.Background(), "Hello")
	if err != nil {
		panic(err)
	}
	println(response)
}`,
    },
  };
}

function BrandIcon({ brand }: { brand: "openai" | "anthropic" | "gemini" | "python" | "vercel" | "langchain" | "curl" }) {
  if (brand === "curl") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
        <path d="M2 3.5h12v9H2z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4 7.5 6 9 4 10.5M7.5 10.5H11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 fill-current">
      <path d={paths[brand]} />
    </svg>
  );
}

const paths = {
  openai:
    "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z",
  anthropic: "M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z",
  gemini: "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81",
  python:
    "M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z",
  vercel: "M24 22.525H0l12-21.05 12 21.05z",
  langchain:
    "M6.0988 5.9175C2.7359 5.9175 0 8.6462 0 12s2.736 6.0825 6.0988 6.0825h11.8024C21.2641 18.0825 24 15.3538 24 12s-2.736-6.0825-6.0988-6.0825ZM5.9774 7.851c.493.0124 1.02.2496 1.273.6228.3673.4592.4778 1.0668.8944 1.4932.5604.6118 1.199 1.1505 1.7161 1.802.4892.5954.8386 1.2937 1.1436 1.9975.1244.2335.1257.5202.31.7197.0908.1204.5346.4483.4383.5645.0555.1204.4702.286.3263.4027-.1944.04-.4129.0476-.5616-.1074-.0549.126-.183.0596-.2819.0432a4 4 0 0 0-.025.0736c-.3288.0219-.5754-.3126-.732-.565-.3111-.168-.6642-.2702-.982-.446-.0182.2895.0452.6485-.231.8353-.014.5565.8436.0656.9222.4804-.061.0067-.1286-.0095-.1774.0373-.2239.2172-.4805-.1645-.7385-.007-.3464.174-.3808.3161-.8096.352-.0237-.0359-.0143-.0592.0059-.0811.1207-.1399.1295-.3046.3356-.3643-.2122-.0334-.3899.0833-.5686.1757-.2323.095-.2304-.2141-.5878.0164-.0396-.0322-.0208-.0615.0018-.0864.0908-.1107.2102-.127.345-.1208-.663-.3686-.9751.4507-1.2813.0432-.092.0243-.1265.1068-.1845.1652-.05-.0548-.0123-.1212-.0099-.1857-.0598-.028-.1356-.041-.1179-.1366-.1171-.0395-.1988.0295-.286.0952-.0787-.0608.0532-.1492.0776-.2125.0702-.1216.23-.025.3111-.1126.2306-.1308.552.0814.8155.0455.203.0255.4544-.1825.3526-.39-.2171-.2767-.179-.6386-.1839-.9695-.0268-.1929-.491-.4382-.6252-.6462-.1659-.1873-.295-.4047-.4243-.6182-.4666-.9008-.3198-2.0584-.9077-2.8947-.266.1466-.6125.0774-.8418-.119-.1238.1125-.1292.2598-.139.4161-.297-.2962-.2593-.8559-.022-1.1855.0969-.1302.2127-.2373.342-.3316.0292-.0213.0391-.0419.0385-.0747.1174-.5267.5764-.7391 1.0694-.7267m12.4071.46c.5575 0 1.0806.2159 1.474.6082s.61.9145.61 1.4704c0 .556-.2167 1.078-.61 1.4698v.0006l-.902.8995a2.08 2.08 0 0 1-.8597.5166l-.0164.0047-.0058.0164a2.05 2.05 0 0 1-.474.7308l-.9018.8995c-.3934.3924-.917.6083-1.4745.6083s-1.0806-.216-1.474-.6083c-.813-.8107-.813-2.1294 0-2.9402l.9019-.8995a2.056 2.056 0 0 1 .858-.5143l.017-.0053.0058-.0158a2.07 2.07 0 0 1 .4752-.7337l.9018-.8995c.3934-.3924.9171-.6083 1.4745-.6083zm0 .8965a1.18 1.18 0 0 0-.8388.3462l-.9018.8995a1.181 1.181 0 0 0-.3427.9252l.0053.0572c.0323.2652.149.5044.3374.6917.13.1296.2733.2114.4471.2686a.9.9 0 0 1 .014.1582.884.884 0 0 1-.2609.6304l-.0554.0554c-.3013-.1028-.5525-.253-.7794-.4792a2.06 2.06 0 0 1-.5761-1.0968l-.0099-.0578-.0461.0368a1.1 1.1 0 0 0-.0876.0794l-.9024.8995c-.4623.461-.4623 1.212 0 1.673.2311.2305.535.346.8394.3461.3043 0 .6077-.1156.8388-.3462l.9019-.8995c.4623-.461.4623-1.2113 0-1.673a1.17 1.17 0 0 0-.4367-.2749 1 1 0 0 1-.014-.1611c0-.2591.1023-.505.2901-.6923.3019.1028.57.2694.7962.495.3007.2999.4994.679.5756 1.0968l.0105.0578.0455-.0373a1.1 1.1 0 0 0 .0887-.0794l.902-.8996c.4622-.461.4628-1.2124 0-1.6735a1.18 1.18 0 0 0-.8395-.3462Zm-9.973 5.1567-.0006.0006c-.0793.3078-.1048.8318-.506.847-.033.1776.1228.2445.2655.1874.141-.0645.2081.0508.2557.1657.2177.0317.5394-.0725.5516-.3298-.325-.1867-.4253-.5418-.5662-.8709",
};

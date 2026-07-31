import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

describe("POST /api/chat", () => {
  const providerKeys = ["OPENAI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "NVIDIA_API_KEY"] as const;
  const originalValues = Object.fromEntries(providerKeys.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    for (const key of providerKeys) delete process.env[key];
  });

  afterEach(() => {
    for (const key of providerKeys) {
      const original = originalValues[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  it("returns a helpful fallback reply when no LLM provider is configured", async () => {
    const request = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Give me a quick overview of this campaign." }],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toContain("AI provider");
  });
});

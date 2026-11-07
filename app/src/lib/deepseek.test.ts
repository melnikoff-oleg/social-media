import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEEPSEEK_URL, generateNewConcepts } from "./deepseek";

const FAKE_KEY = "sk-test-fake-key-123";

const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DEEPSEEK_API_KEY", FAKE_KEY);
  vi.stubEnv("DEEPSEEK_MODEL", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("DeepSeek concept generation", () => {
  it("builds the request and parses choices[0].message.content", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(
      json({ choices: [{ message: { role: "assistant", content: "# Conceitos" } }] })
    );

    expect(await generateNewConcepts("the analysis", "the instructions")).toBe("# Conceitos");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(url).toBe(DEEPSEEK_URL);
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(60_000);

    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("deepseek-chat");
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toContain("the analysis");
    expect(body.messages[1].content).toContain("the instructions");
  });

  it("uses DEEPSEEK_MODEL when set", async () => {
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-reasoner");
    fetchMock.mockResolvedValue(json({ choices: [{ message: { content: "ok" } }] }));
    await generateNewConcepts("a", "b");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe("deepseek-reasoner");
  });

  it("throws a Portuguese error naming only the variable when the key is missing", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    await expect(generateNewConcepts("a", "b")).rejects.toThrow("DEEPSEEK_API_KEY não configurada");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("on a non-OK response throws only the status, never the body or the key", async () => {
    const secretBody = `{"error":{"message":"Authentication Fails, your api key: ${FAKE_KEY} is invalid","detail":"BODY-SECRET"}}`;
    fetchMock.mockResolvedValue(new Response(secretBody, { status: 401 }));

    const err = await generateNewConcepts("a", "b").then(
      () => {
        throw new Error("expected rejection");
      },
      (e: unknown) => e as Error
    );
    expect(err.message).toContain("401");
    expect(err.message).not.toContain("BODY-SECRET");
    expect(err.message).not.toContain("Authentication Fails");
    expect(err.message).not.toContain(FAKE_KEY);
  });
});

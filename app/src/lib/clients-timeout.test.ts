import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Anthropic SDK is replaced so no real API is called; we only check the
// request options the client passes.
const anthropic = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropic.create };
  },
}));

import { scrapeReels, scrapeCreatorStats } from "./apify";
import { uploadVideo, analyzeVideo } from "./gemini";
import { generateNewConcepts } from "./claude";
import { defaultPipelineDeps } from "./pipeline";

const fetchMock = vi.fn();
const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

/** Every fetch call carried an AbortSignal. */
function expectAllSignals() {
  expect(fetchMock).toHaveBeenCalled();
  for (const call of fetchMock.mock.calls) {
    expect((call[1] as RequestInit | undefined)?.signal).toBeInstanceOf(AbortSignal);
  }
}

beforeEach(() => {
  process.env.APIFY_API_TOKEN = "t";
  process.env.GEMINI_API_KEY = "k";
  process.env.ANTHROPIC_API_KEY = "a";
  fetchMock.mockReset();
  timeoutSpy.mockClear();
  anthropic.create.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("external API clients time out", () => {
  it("Apify scrapeReels uses a 300 s timeout", async () => {
    fetchMock.mockResolvedValue(json([]));
    await scrapeReels("alice", 5, 7);
    expectAllSignals();
    expect(timeoutSpy).toHaveBeenCalledWith(300_000);
  });

  it("Apify scrapeCreatorStats uses a 300 s timeout on both calls", async () => {
    fetchMock.mockImplementation(async () => json([]));
    await scrapeCreatorStats("alice");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectAllSignals();
    expect(timeoutSpy.mock.calls.every(([ms]) => ms === 300_000)).toBe(true);
  });

  it("Gemini upload (and the ACTIVE poll) and analysis use a 300 s timeout", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ file: { name: "files/x", uri: "u", mimeType: "video/mp4" } }))
      .mockResolvedValueOnce(json({ state: "ACTIVE" }))
      .mockResolvedValueOnce(json({ candidates: [{ content: { parts: [{ text: "# ok" }] } }] }));
    await uploadVideo(Buffer.from([1]), "video/mp4");
    await analyzeVideo("u", "video/mp4", "prompt");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expectAllSignals();
    expect(timeoutSpy.mock.calls.every(([ms]) => ms === 300_000)).toBe(true);
  });

  it("Claude concept generation passes a 60 s timeout signal", async () => {
    anthropic.create.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    expect(await generateNewConcepts("analysis", "prompt")).toBe("ok");
    const options = anthropic.create.mock.calls[0][1] as { signal?: AbortSignal } | undefined;
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(60_000);
  });

  it("the pipeline's video download has a timeout", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { headers: { "content-type": "video/mp4" } }))
      .mockResolvedValueOnce(json({ file: { name: "files/x", uri: "u", mimeType: "video/mp4" } }))
      .mockResolvedValueOnce(json({ state: "ACTIVE" }))
      .mockResolvedValueOnce(json({ candidates: [{ content: { parts: [{ text: "# ok" }] } }] }));
    await defaultPipelineDeps.analyzeVideo("https://scontent.cdninstagram.com/v.mp4", "p", () => {});
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expectAllSignals();
  });
});

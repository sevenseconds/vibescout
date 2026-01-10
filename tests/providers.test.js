import { describe, it, expect, vi, beforeEach } from "vitest";
import { OllamaProvider } from "../src/providers/OllamaProvider.js";
import { OpenAIProvider } from "../src/providers/OpenAIProvider.js";
import { CloudflareProvider } from "../src/providers/CloudflareProvider.js";
import { GeminiProvider } from "../src/providers/GeminiProvider.js";

// Mock fetch for external providers
global.fetch = vi.fn();

describe("AI Providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("OllamaProvider", () => {
    const provider = new OllamaProvider("llama3", "http://localhost:11434");

    it("should generate embeddings via Ollama API", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2, 0.3] })
      });

      const result = await provider.generateEmbedding("test");
      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/embeddings"), expect.any(Object));
    });
  });

  describe("OpenAIProvider", () => {
    const provider = new OpenAIProvider("text-embedding-3-small", "key-123");

    it("should generate embeddings via OpenAI API", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.5, 0.6] }] })
      });

      const result = await provider.generateEmbedding("test");
      expect(result).toEqual([0.5, 0.6]);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/embeddings"), expect.any(Object));
    });
  });

  describe("CloudflareProvider", () => {
    const provider = new CloudflareProvider("@cf/baai/bge-small-en-v1.5", "acc-id", "token-123");

    it("should generate embeddings via Cloudflare API", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { data: [[0.7, 0.8]] } })
      });

      const result = await provider.generateEmbedding("test");
      expect(result).toEqual([0.7, 0.8]);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/ai/run/"), expect.any(Object));
    });
  });

  describe("GeminiProvider", () => {
    const provider = new GeminiProvider("text-embedding-004", "gem-key");

    it("should generate embeddings via Gemini API", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: { values: [0.9, 1.0] } })
      });

      const result = await provider.generateEmbedding("test");
      expect(result).toEqual([0.9, 1.0]);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("generativelanguage.googleapis.com"), expect.any(Object));
    });
  });
});

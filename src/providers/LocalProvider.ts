import { EmbeddingProvider, SummarizerProvider, ChatMessage } from "./base.js";
import { pipeline, env } from "@huggingface/transformers";
// ... in class ...
  async generateResponse(prompt: string, context: string, history: ChatMessage[] = []): Promise<string> {
    // Local BART is mostly a summarizer, but we can try to use it for simple context-based Q&A.
    // We'll append the last 2 messages for a bit of memory.
    const recentHistory = history.slice(-2).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join("\n");
    const input = `Context:\n${context}\n\nHistory:\n${recentHistory}\n\nQuestion: ${prompt}`.substring(0, 1024);
    try {
      const pipe = await this.getSummarizerPipe();
      const output = await pipe(input, {
        max_new_tokens: 150,
        min_new_tokens: 20,
        repetition_penalty: 2.0
      });
      return output[0].summary_text;
    } catch (err: any) {
      logger.error(`Local Response generation failed: ${err.message}`);
      return "Local model failed to generate response.";
    }
  }
}

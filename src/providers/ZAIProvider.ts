import { OpenAIProvider } from "./OpenAIProvider.js";

/**
 * Z.AI (BigModel.cn) Provider
 * Extends OpenAIProvider as it is compatible with OpenAI API format.
 */
export class ZAIProvider extends OpenAIProvider {
  constructor(modelName: string, apiKey: string) {
    // Default Z.AI base URL
    super(modelName, apiKey, "https://open.bigmodel.cn/api/paas/v4");
    this.name = "zai";
  }
}

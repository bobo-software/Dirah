import { HttpError } from '../utils/HttpError';
import type { PageService } from './PageService';

export type AiCompleteFn = (input: { prompt: string; context: string }) => Promise<string>;

const SYSTEM_PROMPT =
  'You help with a knowledge-workspace page. Use only the provided context. Be concise. Do not invent facts that are not in the context.';

export class AiService {
  constructor(
    private readonly pages: PageService,
    private readonly options: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      complete?: AiCompleteFn;
    } = {}
  ) {}

  enabled(): boolean {
    return Boolean(this.options.complete || this.options.apiKey);
  }

  async ask(userId: string, pageId: string, prompt: string, context: string): Promise<string> {
    const page = await this.pages.requireMemberPage(userId, pageId);
    if (!this.enabled()) {
      throw new HttpError(
        'AI is not configured. Set AI_API_KEY on the server to enable Ask.',
        503,
        'AI_UNAVAILABLE'
      );
    }
    let ctx = context;
    if (!ctx.trim() && page.kind === 'markdown') {
      const body = await this.pages.loadMarkdownBody(pageId);
      ctx = body?.content ?? '';
    }
    if (this.options.complete) {
      return this.options.complete({ prompt, context: ctx });
    }
    return this.callProvider(prompt, ctx);
  }

  private async callProvider(prompt: string, context: string): Promise<string> {
    const baseUrl = this.options.baseUrl ?? 'https://api.openai.com/v1';
    const model = this.options.model ?? 'gpt-4o-mini';
    const user = context.trim()
      ? `Context:\n${context.trim()}\n\nRequest:\n${prompt}`
      : prompt;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: user },
          ],
          max_tokens: 800,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new HttpError('AI provider is unreachable', 502, 'AI_PROVIDER');
    }
    if (!response.ok) {
      throw new HttpError('AI provider rejected the request', 502, 'AI_PROVIDER');
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new HttpError('AI provider returned an empty reply', 502, 'AI_PROVIDER');
    }
    return text;
  }
}

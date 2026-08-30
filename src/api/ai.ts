import { apiRequest } from './client';

export async function askPage(
  accessToken: string,
  pageId: string,
  prompt: string,
  context: string
): Promise<string> {
  const data = await apiRequest<{ reply: string }>(`/api/ai/pages/${pageId}`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ prompt, context }),
  });
  return data.reply;
}

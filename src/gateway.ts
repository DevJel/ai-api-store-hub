import type { Env } from './types';
import { getModelPrice, calculateCost, recordUsage, hasSufficientCredits } from './billing';

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
}

export async function handleChatCompletions(
  env: Env,
  body: ChatRequest,
  tenantId: string,
  apiKeyId?: string
): Promise<Response> {
  const start = Date.now();
  const model = body.model || '@cf/meta/llama-3.1-8b-instruct';

  // rough estimate for credit check (assume 1k in + 1k out)
  const prices = await getModelPrice(env, model);
  const estimated = calculateCost(1000, 1000, prices);

  if (!(await hasSufficientCredits(env, tenantId, estimated))) {
    return Response.json(
      { error: { message: 'Insufficient credits. Please top up.', type: 'billing_error' } },
      { status: 402 }
    );
  }

  try {
    // Call via Workers AI binding (which can route through AI Gateway)
    // For third-party models use the REST AI Gateway endpoints instead.
    const result = await env.AI.run(model as any, {
      messages: body.messages,
      max_tokens: body.max_tokens ?? 1024,
      temperature: body.temperature ?? 0.7,
    }, {
      gateway: {
        id: env.AI_GATEWAY_ID || 'default',
      },
    });

    // Normalize response (Workers AI shape varies)
    const responseText =
      typeof result === 'object' && result !== null && 'response' in result
        ? (result as any).response
        : JSON.stringify(result);

    // Token counting is approximate here – production should use actual usage from gateway logs
    const inputTokens = Math.ceil(
      body.messages.reduce((acc, m) => acc + m.content.length, 0) / 4
    );
    const outputTokens = Math.ceil(String(responseText).length / 4);
    const cost = calculateCost(inputTokens, outputTokens, prices);

    await recordUsage(env, {
      tenantId,
      apiKeyId,
      model,
      inputTokens,
      outputTokens,
      cost,
      latencyMs: Date.now() - start,
      status: 'success',
    });

    // OpenAI-compatible response shape
    return Response.json({
      id: 'chatcmpl-' + crypto.randomUUID(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: responseText,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      },
    });
  } catch (err: any) {
    await recordUsage(env, {
      tenantId,
      apiKeyId,
      model,
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      latencyMs: Date.now() - start,
      status: 'error',
    });

    return Response.json(
      { error: { message: err?.message || 'Model request failed', type: 'api_error' } },
      { status: 500 }
    );
  }
}

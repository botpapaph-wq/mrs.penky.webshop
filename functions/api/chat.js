/**
 * Cloudflare Pages Function
 * AI Chatbot using Workers AI (Llama)
 */

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { message, history } = await request.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid message' }), { status: 400 });
    }

    // Build conversation history
    const messages = history || [];
    messages.push({ role: 'user', content: message });

    // Limit history to avoid token overflow
    const recentMessages = messages.slice(-10);

    // System prompt for Mrs. Penky
    const systemPrompt = `You are a helpful customer service assistant for Mrs. Penky, a luxury online store specializing in handmade leather goods.
You have access to the following product info:
- Premium Pensky Tote: PHP 2,999 / USD 54 (leather tote bag)
- Classic Pensky Wallet: PHP 1,299 / USD 23.50 (RFID-blocking wallet)
- Limited Edition Key Chain: PHP 599 / USD 10.75 (brass & leather key fob)
- Pensky Travel Case: PHP 4,999 / USD 90 (carry-on organizer)

Be friendly, concise, and helpful. If the customer asks about products, payment, shipping, or returns, provide accurate information.
If you don't know something, offer to escalate to support.`;

    // Call Cloudflare Workers AI (Llama model)
    const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      messages: [
        { role: 'system', content: systemPrompt },
        ...recentMessages.map((msg) => ({
          role: msg.role || 'user',
          content: msg.content,
        })),
      ],
      max_tokens: 256,
      temperature: 0.7,
    });

    const assistantMessage = response.response || '';

    return new Response(
      JSON.stringify({
        message: assistantMessage,
        history: [...recentMessages, { role: 'assistant', content: assistantMessage }],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('Chat error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}

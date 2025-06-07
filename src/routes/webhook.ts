import { Context } from 'hono';
import { CONFIG } from '../config';
import { Env, Variables } from '../types';

export function handleWebhookVerification(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>) {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  console.log("token", CONFIG.WHATSAPP.WEBHOOK_VERIFY_TOKEN);

  if (mode === 'subscribe' && token === CONFIG.WHATSAPP.WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified successfully');
    return c.text(challenge || '');
  } else {
    console.error('Webhook verification failed');
    return c.text('Verification failed', 403);
  }
}

import { Hono, Context } from 'hono';
import { WhatsAppService } from '../services/whatsapp';
import { CONFIG } from '../config';
import { Env, WhatsAppWebhookPayload, Variables } from '../types';
import { normalizePhoneNumber } from '../utils/phone';

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

export async function handleIncomingWebhookMessage(c: Context<{
  Bindings: Env;
  Variables: Variables;
}>, whatsappService: WhatsAppService) {
  const payload = await c.req.json<WhatsAppWebhookPayload>();
  console.log("payload", payload);  
  // Process incoming messages
  if (payload.object === 'whatsapp_business_account') {
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field === 'messages') {
          const value = change.value;
            
          // Process incoming messages
          if (value.messages && value.messages.length > 0) {
            for (const message of value.messages) {
              const from = message.from;
                
              const normalizedFrom = normalizePhoneNumber(from);

              // Handle text messages
              if (message.type === 'text' && message.text) {
                const text = message.text.body;
                console.log(`Received message from ${from}: ${text}. Normalized to: ${normalizedFrom}`);
                  
                // Auto-reply to incoming messages
                await whatsappService.sendTextMessage(
                  normalizedFrom,
                  'Thank you for your message. This is an automated login service. Please use the app to initiate login.'
                );
              }
                
              // Handle button clicks
              if (message.type === 'button' && message.button) {
                const payload = message.button.payload;
                console.log(`Received button click from ${from} with payload: ${payload}. Normalized from: ${normalizedFrom}`);
                  
                // Process button actions if needed
              }
            }
          }
        }
      }
    }
      
    return c.json({ success: true });
  }
    
  return c.json({ success: false, error: 'Invalid payload' }, 400);
}

import { Hono } from 'hono';
import { WhatsAppService } from '../services/whatsapp';
import { CONFIG } from '../config';
import { Env, WhatsAppWebhookPayload } from '../types';

export function createWebhookRoutes(whatsappService: WhatsAppService) {
  const app = new Hono<{ Bindings: Env }>();

  // Webhook verification endpoint (required by WhatsApp Cloud API)
  app.get('/', async (c) => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const challenge = c.req.query('hub.challenge');
    console.log("token", CONFIG.WHATSAPP.WEBHOOK_VERIFY_TOKEN);
    // Verify the webhook
    if (mode === 'subscribe' && token === CONFIG.WHATSAPP.WEBHOOK_VERIFY_TOKEN) {
      console.log('Webhook verified successfully');
      return c.text(challenge || '');
    } else {
      console.error('Webhook verification failed');
      return c.text('Verification failed', 403);
    }
  });

  // Webhook for incoming messages
  app.post('/', async (c) => {
    const payload = await c.req.json<WhatsAppWebhookPayload>();
    
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
                
                // Handle text messages
                if (message.type === 'text' && message.text) {
                  const text = message.text.body;
                  console.log(`Received message from ${from}: ${text}`);
                  
                  // Auto-reply to incoming messages
                  await whatsappService.sendTextMessage(
                    from,
                    'Thank you for your message. This is an automated login service. Please use the app to initiate login.'
                  );
                }
                
                // Handle button clicks
                if (message.type === 'button' && message.button) {
                  const payload = message.button.payload;
                  console.log(`Received button click from ${from} with payload: ${payload}`);
                  
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
  });

  return app;
}
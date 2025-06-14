import { CONFIG } from '../config';
import type { WhatsAppMessage } from '../types';

export class WhatsAppService {
  private apiToken: string;
  private phoneNumberId: string;
  private apiVersion = 'v23.0';
  private baseUrl = 'https://graph.facebook.com';

  constructor(apiToken: string, phoneNumberId: string) {
    this.apiToken = apiToken;
    this.phoneNumberId = phoneNumberId;
  }

  async sendMessage(to: string, message: WhatsAppMessage): Promise<any> {
    const url = `${this.baseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiToken}`
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`WhatsApp API error: ${JSON.stringify(error)}`);
    }

    return await response.json();
  }

  async sendInteractiveButtonMessage(
    to: string,
    buttonText: string,
    buttonPayload: string,
    bodyText: string
  ): Promise<any> {
    // If mocking is enabled, just log and return success
    if (CONFIG.MOCK.WHATSAPP_API) {
      console.log(`[MOCK] Sending interactive button message to ${to} with payload: ${buttonPayload}`);
      return { success: true, mock: true };
    }

    const message: WhatsAppMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: bodyText,
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: buttonPayload,
                title: buttonText,
              },
            },
          ],
        },
      },
    };

    return this.sendMessage(to, message);
  }

  async sendLoginLink(to: string, loginToken: string): Promise<any> {
    // If mocking is enabled, just log and return success
    if (CONFIG.MOCK.WHATSAPP_API) {
      console.log(`[MOCK] Sending login link to ${to} with token: ${loginToken}`);
      return { success: true, mock: true };
    }

    const loginUrl = `${CONFIG.APP.FRONTEND_URL}/auth/verify?token=${loginToken}`;
    
    const message: WhatsAppMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: 'login_link',
        language: {
          code: 'en_US'
        },
        components: [
          {
            type: 'body',
            parameters: [
              {
                type: 'text',
                text: loginUrl
              }
            ]
          }
        ]
      }
    };

    return this.sendMessage(to, message);
  }

  async sendHelloWorldMessage(to: string): Promise<any> {
    if (CONFIG.MOCK.WHATSAPP_API) {
      console.log(`[MOCK] Sending hello_world message to ${to}`);
      return { success: true, mock: true };
    }

    const message: WhatsAppMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: 'hello_world',
        language: {
          code: 'en_US'
        },
        components: []
      }
    };

    return this.sendMessage(to, message);
  }

  async sendTextMessage(to: string, text: string): Promise<any> {
    const message: WhatsAppMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        body: text
      }
    };

    return this.sendMessage(to, message);
  }
}
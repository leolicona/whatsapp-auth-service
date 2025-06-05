export interface User {
  id: string;
  phone_number: string;
  name: string | null;
  created_at: number;
  last_login: number;
}

export interface Session {
  id: string;
  user_id: string;
  created_at: number;
  expires_at: number;
}

export interface WhatsAppMessage {
  messaging_product: string;
  recipient_type: string;
  to: string;
  type: string;
  text?: {
    body: string;
  };
  template?: {
    name: string;
    language: {
      code: string;
    };
    components: any[];
  };
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: {
            body: string;
          };
          button?: {
            payload: string;
            text: string;
          };
          type: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

export interface Env {
  DB: D1Database;
  WHATSAPP_API_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: string;
  JWT_SECRET: string;
  FRONTEND_URL: string;
}

export type Variables = {
  services: {
    whatsapp: any; 
    user: any;     
    auth: any;     
  }
};
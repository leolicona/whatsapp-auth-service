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
  auth_token?: string;
  refresh_token?: string;
  status: 'pending' | 'ready' | 'completed';
}

export interface VerificationToken {
  id: string;
  token_hash: string;
  phone_number: string;
  expires_at: number;
  used_at?: number;
  created_at: number;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
  revoked_at?: number;
}

export interface TokenPayload {
  token: string;
  isNewUser: boolean;
  phoneNumber: string;
  timestamp: number;
  expiresAt: number;
  sessionId?: string;
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
  interactive?: {
    type: 'button';
    body: {
      text: string;
    };
    action: {
      buttons: Array<{
        type: 'reply';
        reply: {
          title: string;
          id: string;
        };
      }>;
    };
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
  WEBHOOK_PROCESSOR_DO: DurableObjectNamespace;
  AUTH_SESSION_DO: DurableObjectNamespace;
  JWT_SECRET: string;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: string;
  WHATSAPP_BUSINESS_ACCOUNT_ID: string;
}

// Standardized API Response Types
export interface ApiSuccessResponse<T = any> {
  status: 'success';
  statusCode: number;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  status: 'error';
  statusCode: number;
  error: {
    code: string;
    message: string;
    details: string;
  };
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// Helper functions to create standardized responses
export function createSuccessResponse<T>(
  data: T,
  message: string,
  statusCode: number = 200
): ApiSuccessResponse<T> {
  return {
    status: 'success',
    statusCode,
    message,
    data
  };
}

export function createErrorResponse(
  code: string,
  message: string,
  details: string,
  statusCode: number = 400
): ApiErrorResponse {
  return {
    status: 'error',
    statusCode,
    error: {
      code,
      message,
      details
    }
  };
}

// Common error codes
export const ERROR_CODES = {
  // Authentication errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  MISSING_AUTHORIZATION: 'MISSING_AUTHORIZATION',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  
  // User errors
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_NAME: 'INVALID_NAME',
  
  // Request errors
  MISSING_PARAMETERS: 'MISSING_PARAMETERS',
  MISSING_USER_ID: 'MISSING_USER_ID',
  MISSING_SESSION_ID: 'MISSING_SESSION_ID',
  
  // Operation errors
  MESSAGE_SEND_FAILED: 'MESSAGE_SEND_FAILED',
  LOGOUT_FAILED: 'LOGOUT_FAILED',
  UPDATE_FAILED: 'UPDATE_FAILED'
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

export interface AuthInfo {
  userId: string;
  sessionId: string;
}

export type Variables = {
  services: {
    whatsapp: any; 
    user: any;     
    auth: any;
    verification: any;
  };
  authInfo?: AuthInfo; // Optional authInfo property
};
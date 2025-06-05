export const CONFIG = {
  WHATSAPP: {
    API_TOKEN: '',  // Will be set from environment variables
    PHONE_NUMBER_ID: '',  // Will be set from environment variables
    WEBHOOK_VERIFY_TOKEN: '',  // Will be set from environment variables
  },
  JWT: {
    SECRET: '',  // Will be set from environment variables
    EXPIRY: 60 * 60 * 24 * 7, // 7 days in seconds
  },
  APP: {
    FRONTEND_URL: 'https://example.com',  // Will be set from environment variables
  },
  MOCK: {
    WHATSAPP_API: false, // Default to false
  },
};

// This function will be called to initialize config with environment variables
export function initializeConfig(env: any) {
  CONFIG.WHATSAPP.API_TOKEN = env.WHATSAPP_API_TOKEN || CONFIG.WHATSAPP.API_TOKEN;
  CONFIG.WHATSAPP.PHONE_NUMBER_ID = env.WHATSAPP_PHONE_NUMBER_ID || CONFIG.WHATSAPP.PHONE_NUMBER_ID;
  CONFIG.WHATSAPP.WEBHOOK_VERIFY_TOKEN = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || CONFIG.WHATSAPP.WEBHOOK_VERIFY_TOKEN;
  CONFIG.JWT.SECRET = env.JWT_SECRET || CONFIG.JWT.SECRET;
  CONFIG.APP.FRONTEND_URL = env.FRONTEND_URL || CONFIG.APP.FRONTEND_URL;
  
  CONFIG.MOCK.WHATSAPP_API = env.MOCK_WHATSAPP_API === 'true'; // Set from environment variable
  
  return CONFIG;
}
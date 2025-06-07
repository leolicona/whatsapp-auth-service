# API Response Format Documentation

This document describes the standardized JSON response format used across all API endpoints in the WhatsApp OTPless Authentication system.

## Response Structure

All API responses follow a consistent structure to ensure predictability and ease of integration.

### Success Response Format

```json
{
  "status": "success",
  "statusCode": 200,
  "message": "Human-readable success message",
  "data": {
    // Response payload
  }
}
```

### Error Response Format

```json
{
  "status": "error",
  "statusCode": 400,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": "Additional error details"
  }
}
```

## Field Descriptions

### Common Fields

- **`status`**: Always either `"success"` or `"error"`
- **`statusCode`**: HTTP status code (200, 400, 401, 404, 500, etc.)
- **`message`**: Human-readable message describing the result

### Success Response Fields

- **`data`**: Contains the actual response payload (user data, tokens, etc.)

### Error Response Fields

- **`error.code`**: Machine-readable error code for programmatic handling
- **`error.message`**: Human-readable error message
- **`error.details`**: Additional context or troubleshooting information

## API Endpoint Examples

### Authentication Endpoints

#### POST `/api/auth/initiate`

**Success Response:**
```json
{
  "status": "success",
  "statusCode": 200,
  "message": "Confirmation message sent successfully",
  "data": {
    "sessionId": "abc123-def456-ghi789"
  }
}
```

**Error Response:**
```json
{
  "status": "error",
  "statusCode": 500,
  "error": {
    "code": "MESSAGE_SEND_FAILED",
    "message": "Failed to send confirmation message",
    "details": "Failed to send WhatsApp message"
  }
}
```

#### POST `/api/auth/refresh`

**Success Response:**
```json
{
  "status": "success",
  "statusCode": 200,
  "message": "Tokens refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "def456-ghi789-jkl012"
  }
}
```

**Error Response:**
```json
{
  "status": "error",
  "statusCode": 401,
  "error": {
    "code": "INVALID_REFRESH_TOKEN",
    "message": "Invalid or expired refresh token",
    "details": "The provided refresh token is not valid or has expired"
  }
}
```

#### POST `/api/auth/logout`

**Success Response:**
```json
{
  "status": "success",
  "statusCode": 200,
  "message": "Logged out successfully",
  "data": {
    "success": true
  }
}
```

**Error Response:**
```json
{
  "status": "error",
  "statusCode": 400,
  "error": {
    "code": "MISSING_USER_ID",
    "message": "Missing required parameter",
    "details": "user_id is required for logout"
  }
}
```

#### GET `/api/auth/validate`

**Success Response:**
```json
{
  "status": "success",
  "statusCode": 200,
  "message": "Token validated successfully",
  "data": {
    "valid": true,
    "userId": "user123"
  }
}
```

**Error Response:**
```json
{
  "status": "error",
  "statusCode": 401,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid or expired token",
    "details": "The provided access token is not valid or has expired"
  }
}
```

#### GET `/api/auth/ws`

**Error Response (Missing Session ID):**
```json
{
  "status": "error",
  "statusCode": 400,
  "error": {
    "code": "MISSING_SESSION_ID",
    "message": "Session ID is required",
    "details": "sessionId query parameter is required for WebSocket connection"
  }
}
```

### User Endpoints

#### GET `/api/user/me`

**Success Response:**
```json
{
  "status": "success",
  "statusCode": 200,
  "message": "User retrieved successfully",
  "data": {
    "id": "user123",
    "phoneNumber": "+1234567890",
    "name": "Leo Licona",
    "createdAt": 1698307200
  }
}
```

**Error Response:**
```json
{
  "status": "error",
  "statusCode": 404,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "The requested user could not be found",
    "details": "No user exists with the provided ID"
  }
}
```

#### PUT `/api/user/me`

**Success Response:**
```json
{
  "status": "success",
  "statusCode": 200,
  "message": "User updated successfully",
  "data": {
    "success": true,
    "name": "Leo Licona"
  }
}
```

**Error Response:**
```json
{
  "status": "error",
  "statusCode": 400,
  "error": {
    "code": "INVALID_NAME",
    "message": "Invalid name provided",
    "details": "Name must be a non-empty string"
  }
}
```

### Webhook Endpoints

#### POST `/api/webhook`

**Success Response:**
```json
{
  "status": "success",
  "statusCode": 200,
  "message": "Webhook received successfully",
  "data": {
    "received": true
  }
}
```

## Error Codes Reference

### Authentication Errors
- `UNAUTHORIZED`: Missing or invalid authentication
- `INVALID_TOKEN`: Access token is invalid or expired
- `MISSING_AUTHORIZATION`: Authorization header is missing or malformed
- `INVALID_REFRESH_TOKEN`: Refresh token is invalid or expired

### User Errors
- `USER_NOT_FOUND`: Requested user does not exist
- `INVALID_NAME`: Provided name is invalid or empty

### Request Errors
- `MISSING_PARAMETERS`: Required request parameters are missing
- `MISSING_USER_ID`: User ID parameter is required but not provided
- `MISSING_SESSION_ID`: Session ID parameter is required but not provided

### Operation Errors
- `MESSAGE_SEND_FAILED`: Failed to send WhatsApp message
- `LOGOUT_FAILED`: Logout operation failed
- `UPDATE_FAILED`: Update operation failed

## TypeScript Types

The following TypeScript interfaces are available in `src/types.ts`:

```typescript
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
```

## Helper Functions

Utility functions are available to create standardized responses:

```typescript
import { createSuccessResponse, createErrorResponse, ERROR_CODES } from './types';

// Create success response
const successResponse = createSuccessResponse(
  { userId: '123' },
  'User retrieved successfully',
  200
);

// Create error response
const errorResponse = createErrorResponse(
  ERROR_CODES.USER_NOT_FOUND,
  'User not found',
  'No user exists with the provided ID',
  404
);
```

## Best Practices

1. **Consistency**: Always use the standardized format across all endpoints
2. **Meaningful Messages**: Provide clear, actionable error messages
3. **Appropriate Status Codes**: Use correct HTTP status codes that match the response
4. **Error Codes**: Use predefined error codes for programmatic error handling
5. **Data Structure**: Keep the `data` field structure consistent for similar operations
6. **Security**: Don't expose sensitive information in error details
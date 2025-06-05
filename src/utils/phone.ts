export function normalizePhoneNumber(phoneNumber: string): string {
  // Check if the number starts with '521' (Mexico country code + extra '1')
  if (phoneNumber.startsWith('521')) {
    return '52' + phoneNumber.substring(3);
  }
  return phoneNumber;
} 
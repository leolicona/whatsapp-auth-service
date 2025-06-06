export function normalizePhoneNumber(phoneNumber: string): string {
  // Remove any non-digit characters
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  
  // Handle Mexican numbers specifically
  // Mexican numbers can be formatted as +521XXXXXXXXXX or +52XXXXXXXXXX
  // We want to normalize to +52XXXXXXXXXX (remove the extra 1 for mobile numbers)
  let normalizedDigits = digitsOnly;
  if (digitsOnly.startsWith('521') && digitsOnly.length === 13) {
    // This is a Mexican mobile number with the extra 1, remove it
    normalizedDigits = digitsOnly.substring(0, 2) + digitsOnly.substring(3);
  }
  
  // Ensure the number starts with '+' for consistency
  return normalizedDigits.startsWith('+') ? normalizedDigits : '+' + normalizedDigits;
}
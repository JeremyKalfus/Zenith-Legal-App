export function sanitizePhoneInput(value: string): string {
  const trimmed = value.trim();
  let result = '';
  for (const character of trimmed) {
    if (character >= '0' && character <= '9') {
      result += character;
      continue;
    }
    if (character === '+' && result.length === 0) {
      result = '+';
    }
  }
  return result;
}

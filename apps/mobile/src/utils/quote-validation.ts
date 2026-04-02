export function canSend(itemCount: number, phone: string): boolean {
  if (itemCount < 1) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10;
}

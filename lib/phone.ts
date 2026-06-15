export function normalizePhone(input: string) {
  const digits = String(input || "").replace(/\D/g, "");

  if (digits.length === 10) return `7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return digits;

  return digits;
}

export function prettyPhone(input: string) {
  const phone = normalizePhone(input);
  if (phone.length !== 11 || !phone.startsWith("7")) return phone;
  return `+7 ${phone.slice(1, 4)} ${phone.slice(4, 7)}-${phone.slice(7, 9)}-${phone.slice(9, 11)}`;
}

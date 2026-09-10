import { calendarDaysUntil } from "@/lib/domain/inventory/lots";

export function expirationRelativeLabel(today: string, date: string): string | null {
  const days = calendarDaysUntil(today, date);
  if (days < 0) {
    return null;
  }
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "tomorrow";
  }
  return `in ${days} days`;
}

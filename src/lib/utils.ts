import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const DHAKA_TIMEZONE = "Asia/Dhaka";

/**
 * Returns date in YYYY-MM-DD format strictly in Asia/Dhaka timezone.
 */
export function getDhakaDateString(dateInput?: Date | string | number | null): string {
  if (!dateInput) {
    const now = new Date();
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: DHAKA_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
  const d = typeof dateInput === "string" || typeof dateInput === "number" ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Formats a date to Bengali date string in Asia/Dhaka timezone.
 */
export function formatDhakaDate(
  dateInput?: Date | string | number | null,
  options?: Intl.DateTimeFormatOptions,
  locale: string = "bn-BD"
): string {
  if (!dateInput) return "";
  const d = typeof dateInput === "string" || typeof dateInput === "number" ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, {
    timeZone: DHAKA_TIMEZONE,
    ...options,
  });
}

/**
 * Formats time in Asia/Dhaka timezone.
 */
export function formatDhakaTime(
  dateInput?: Date | string | number | null,
  options?: Intl.DateTimeFormatOptions,
  locale: string = "bn-BD"
): string {
  if (!dateInput) return "";
  const d = typeof dateInput === "string" || typeof dateInput === "number" ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(locale, {
    timeZone: DHAKA_TIMEZONE,
    ...options,
  });
}

/**
 * Formats full date and time in Asia/Dhaka timezone.
 */
export function formatDhakaDateTime(
  dateInput?: Date | string | number | null,
  options?: Intl.DateTimeFormatOptions,
  locale: string = "bn-BD"
): string {
  if (!dateInput) return "";
  const d = typeof dateInput === "string" || typeof dateInput === "number" ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(locale, {
    timeZone: DHAKA_TIMEZONE,
    ...options,
  });
}

/**
 * Check if a date falls on Dhaka's "today".
 */
export function isDhakaToday(dateInput?: Date | string | number | null): boolean {
  if (!dateInput) return false;
  return getDhakaDateString(dateInput) === getDhakaDateString();
}

/**
 * Check if a date falls within the current month in Dhaka.
 */
export function isDhakaThisMonth(dateInput?: Date | string | number | null): boolean {
  if (!dateInput) return false;
  const dhakaDate = getDhakaDateString(dateInput);
  const currentDhakaMonth = getDhakaDateString().slice(0, 7); // YYYY-MM
  return dhakaDate.startsWith(currentDhakaMonth);
}


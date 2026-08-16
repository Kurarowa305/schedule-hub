import type { ScheduleType } from "@schedule-hub/shared";

export type CalendarEventVisibility =
  | "default"
  | "public"
  | "private"
  | "confidential";

export interface CalendarEventReminder {
  readonly method: "email" | "popup";
  readonly minutes: number;
}

export interface CalendarEventReminders {
  readonly useDefault: boolean;
  readonly overrides?: readonly CalendarEventReminder[];
}

export interface CalendarEventCreateInput {
  readonly operationId: string;
  readonly userId: string;
  readonly physicalCalendarId: string;
  readonly externalCalendarId: string;
  readonly title: string;
  readonly description?: string;
  readonly scheduleType: ScheduleType;
  readonly start: string;
  readonly end: string;
  readonly timezone: string;
  readonly eventColorId?: string | null;
  readonly visibility?: CalendarEventVisibility;
  readonly reminders?: CalendarEventReminders;
  readonly sendUpdates?: "all" | "externalOnly" | "none";
}

export interface CalendarConnectionCredentials {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessTokenExpiresAt: number;
}

export interface CalendarCredentialUpdate {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: number;
}

export interface CalendarEventCreateResult {
  readonly externalEventId: string;
  readonly credentialUpdate: CalendarCredentialUpdate | null;
}

export interface CalendarProviderAdapter {
  createEvent(
    input: CalendarEventCreateInput,
    credentials: CalendarConnectionCredentials,
  ): Promise<CalendarEventCreateResult>;
}

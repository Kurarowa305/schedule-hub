export const scheduleTypeValues = ["TIMED", "ALL_DAY"] as const;

export type ScheduleType = (typeof scheduleTypeValues)[number];

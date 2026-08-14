export const scheduleTypeValues = ["TIMED", "ALL_DAY"] as const;

export type ScheduleType = (typeof scheduleTypeValues)[number];

export * from "./domain/create-operation.js";

export * from "./domain/logical-destination.js";

export * from "./domain/physical-calendar.js";

export * from "./domain/user-preference.js";

export * from "./domain/validation-error.js";

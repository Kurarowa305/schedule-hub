import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export type McpToolName = "get_schedule_context" | "create_schedule";

export interface SchemaValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type SchemaValidationResult =
  | { readonly success: true }
  | {
      readonly success: false;
      readonly issues: readonly SchemaValidationIssue[];
    };

const schemaVersion = "https://json-schema.org/draft/2020-12/schema";
const operationIdPattern = "^op_[0-9A-HJKMNP-TV-Z]{26}$";
const datePattern = "^\\d{4}-\\d{2}-\\d{2}$";
const rfc3339Pattern =
  "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$";
const destinationInferenceValues = [
  "EXPLICIT",
  "ALIAS_MATCH",
  "SEMANTIC_INFERENCE",
  "DEFAULT",
  "CONFIRMED_BY_USER",
] as const;
const businessErrorCodeValues = [
  "INVALID_DATETIME",
  "INVALID_DESTINATION",
  "DESTINATION_DISABLED",
  "NO_WRITABLE_CALENDAR",
  "PROVIDER_AUTH_EXPIRED",
  "PROVIDER_API_ERROR",
  "OPERATION_ID_CONFLICT",
  "OPERATION_IN_PROGRESS",
] as const;

const toolErrorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "action"],
      properties: {
        code: { type: "string", enum: businessErrorCodeValues },
        message: { type: "string", minLength: 1, maxLength: 500 },
        action: { type: "string", minLength: 1, maxLength: 100 },
      },
    },
  },
} as const;

export const getScheduleContextInputSchema = {
  $schema: schemaVersion,
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

const getScheduleContextSuccessSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "currentDateTime",
    "timezone",
    "defaultDurationMinutes",
    "defaultDestinationIds",
    "destinations",
  ],
  properties: {
    currentDateTime: {
      type: "string",
      pattern: rfc3339Pattern,
      format: "date-time",
    },
    timezone: { type: "string", minLength: 1, maxLength: 100 },
    defaultDurationMinutes: {
      type: "integer",
      minimum: 1,
      maximum: 1440,
    },
    defaultDestinationIds: {
      type: "array",
      maxItems: 50,
      uniqueItems: true,
      items: { type: "string", minLength: 1 },
    },
    destinations: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "aliases", "description"],
        properties: {
          id: { type: "string", minLength: 1 },
          name: { type: "string", minLength: 1, maxLength: 100 },
          aliases: {
            type: "array",
            maxItems: 20,
            uniqueItems: true,
            items: { type: "string", minLength: 1, maxLength: 50 },
          },
          description: { type: "string", maxLength: 500 },
        },
      },
    },
  },
} as const;

export const getScheduleContextOutputSchema = {
  $schema: schemaVersion,
  type: "object",
  oneOf: [getScheduleContextSuccessSchema, toolErrorSchema],
} as const;

const nullableText = (maxLength: number) =>
  ({
    anyOf: [{ type: "string", maxLength }, { type: "null" }],
  }) as const;

export const createScheduleInputSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: [
    "operationId",
    "title",
    "scheduleType",
    "start",
    "destinationIds",
    "destinationInference",
  ],
  properties: {
    operationId: { type: "string", pattern: operationIdPattern },
    title: { type: "string", minLength: 1, maxLength: 200 },
    scheduleType: { type: "string", enum: ["TIMED", "ALL_DAY"] },
    start: { type: "string" },
    end: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    destinationIds: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      uniqueItems: true,
      items: { type: "string", minLength: 1 },
    },
    location: nullableText(500),
    description: nullableText(5000),
    assumptions: {
      type: "array",
      maxItems: 20,
      items: { type: "string", maxLength: 500 },
    },
    sourceText: nullableText(2000),
    destinationInference: {
      type: "object",
      additionalProperties: false,
      required: ["type", "reason"],
      properties: {
        type: { type: "string", enum: destinationInferenceValues },
        reason: { type: "string", maxLength: 500 },
      },
    },
  },
  allOf: [
    {
      if: {
        properties: { scheduleType: { const: "TIMED" } },
        required: ["scheduleType"],
      },
      then: {
        properties: {
          start: {
            type: "string",
            pattern: rfc3339Pattern,
            format: "date-time",
          },
          end: {
            anyOf: [
              { type: "string", pattern: rfc3339Pattern, format: "date-time" },
              { type: "null" },
            ],
          },
        },
      },
      else: {
        properties: {
          start: { type: "string", pattern: datePattern, format: "date" },
          end: {
            anyOf: [
              { type: "string", pattern: datePattern, format: "date" },
              { type: "null" },
            ],
          },
        },
      },
    },
  ],
} as const;

const scheduleOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "scheduleType", "start", "end", "timezone"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200 },
    scheduleType: { type: "string", enum: ["TIMED", "ALL_DAY"] },
    start: { type: "string", minLength: 1 },
    end: { type: "string", minLength: 1 },
    timezone: { type: "string", minLength: 1, maxLength: 100 },
  },
  allOf: [
    {
      if: {
        properties: { scheduleType: { const: "TIMED" } },
        required: ["scheduleType"],
      },
      then: {
        properties: {
          start: {
            type: "string",
            pattern: rfc3339Pattern,
            format: "date-time",
          },
          end: {
            type: "string",
            pattern: rfc3339Pattern,
            format: "date-time",
          },
        },
      },
      else: {
        properties: {
          start: { type: "string", pattern: datePattern, format: "date" },
          end: { type: "string", pattern: datePattern, format: "date" },
        },
      },
    },
  ],
} as const;

const createScheduleSuccessSchema = {
  type: "object",
  additionalProperties: false,
  required: ["operationId", "status", "replayed", "schedule", "destinations"],
  properties: {
    operationId: { type: "string", pattern: operationIdPattern },
    status: {
      type: "string",
      enum: ["SUCCESS", "PARTIAL_SUCCESS", "FAILED"],
    },
    replayed: { type: "boolean" },
    schedule: scheduleOutputSchema,
    appliedDefaults: {
      type: "array",
      maxItems: 1,
      uniqueItems: true,
      items: { type: "string", enum: ["end"] },
    },
    destinations: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "status", "errorCode"],
        properties: {
          id: { type: "string", minLength: 1 },
          name: { type: "string", minLength: 1, maxLength: 100 },
          status: {
            type: "string",
            enum: ["CREATED", "PARTIAL_SUCCESS", "FAILED"],
          },
          errorCode: {
            anyOf: [
              { type: "string", enum: businessErrorCodeValues },
              { type: "null" },
            ],
          },
        },
      },
    },
    warnings: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message"],
        properties: {
          code: { type: "string", enum: businessErrorCodeValues },
          message: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
    },
  },
} as const;

export const createScheduleOutputSchema = {
  $schema: schemaVersion,
  type: "object",
  oneOf: [createScheduleSuccessSchema, toolErrorSchema],
} as const;

export const mcpToolDefinitions = [
  {
    name: "get_schedule_context",
    title: "予定作成コンテキスト取得",
    description:
      "予定の日時と登録先を判断するために、認証ユーザーのSchedule Hub設定を取得します。予定を作成する前に、現在時刻、タイムゾーン、デフォルト所要時間、デフォルト登録先、利用可能なLogical DestinationのID・名称・Alias・用途を確認するために使用してください。Physical Calendar IDやProvider上のCalendar IDは返しません。",
    inputSchema: getScheduleContextInputSchema,
    outputSchema: getScheduleContextOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "create_schedule",
    title: "予定作成",
    description:
      "認証ユーザーのカレンダーへ予定を新規作成します。このToolを呼ぶ前に、予定タイトル、開始日時、およびLogical Destinationを一意に決定してください。登録先の判断にはget_schedule_contextで取得したDestinationのみを使用し、存在しないDestination IDやPhysical Calendar IDを生成してはいけません。ユーザーの発話に登録先情報がない場合は、get_schedule_contextのdefaultDestinationIdsを使用してください。開始日時や登録先が複数の意味に解釈できる場合は、このToolを呼ばず、先にユーザーへ確認してください。終了時刻が指定されていないことだけを理由に確認してはいけません。Schedule HubがユーザーのdefaultDurationMinutesを使用して補完します。",
    inputSchema: createScheduleInputSchema,
    outputSchema: createScheduleOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
] as const;

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
});
addFormats(ajv);
const inputValidators: Readonly<Record<McpToolName, ValidateFunction>> = {
  get_schedule_context: ajv.compile(getScheduleContextInputSchema),
  create_schedule: ajv.compile(createScheduleInputSchema),
};
const outputValidators: Readonly<Record<McpToolName, ValidateFunction>> = {
  get_schedule_context: ajv.compile(getScheduleContextOutputSchema),
  create_schedule: ajv.compile(createScheduleOutputSchema),
};

export function validateMcpToolInput(
  toolName: McpToolName,
  value: unknown,
): SchemaValidationResult {
  return validate(inputValidators[toolName], value);
}

export function validateMcpToolOutput(
  toolName: McpToolName,
  value: unknown,
): SchemaValidationResult {
  return validate(outputValidators[toolName], value);
}

function validate(
  validator: ValidateFunction,
  value: unknown,
): SchemaValidationResult {
  if (validator(value)) {
    return { success: true };
  }
  return {
    success: false,
    issues: (validator.errors ?? []).map(toValidationIssue),
  };
}

function toValidationIssue(error: ErrorObject): SchemaValidationIssue {
  return {
    path: error.instancePath.length === 0 ? "/" : error.instancePath,
    message: error.message ?? "Schemaに適合しません",
  };
}

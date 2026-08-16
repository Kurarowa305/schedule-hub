import type { CreateScheduleInput } from "../application/create-schedule/create-schedule-contract.js";
import type { McpToolExecutor } from "../presentation/mcp/mcp-http-endpoint.js";

export interface McpToolServices {
  readonly getScheduleContext: {
    get(userId: string): Promise<unknown>;
  };
  readonly createSchedule: {
    execute(request: {
      readonly userId: string;
      readonly input: CreateScheduleInput;
    }): Promise<unknown>;
  };
}

export function createMcpToolExecutor(
  services: McpToolServices,
): McpToolExecutor {
  return {
    async execute(request) {
      if (request.toolName === "get_schedule_context") {
        return services.getScheduleContext.get(request.userId);
      }
      return services.createSchedule.execute({
        userId: request.userId,
        input: request.input as unknown as CreateScheduleInput,
      });
    },
  };
}

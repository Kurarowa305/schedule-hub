import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 各ファイルがCDKアプリ全体をsynthするため、CIのCPU競合を避ける。
    fileParallelism: false,
    testTimeout: 15_000,
  },
});

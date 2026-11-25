import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{packages,game,apps}/*/{src,test}/**/*.test.ts", "tools/art/src/**/*.test.ts"],
    testTimeout: 15_000,
    // Room integration tests boot a Colyseus test server on a fixed port, so files run one at a time.
    fileParallelism: false,
  },
});

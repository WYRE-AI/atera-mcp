/**
 * Tests for the lazy-loaded Atera client utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the node-atera module before importing the client
vi.mock("@wyre-ai/node-atera", () => ({
  AteraClient: vi.fn().mockImplementation(function () { return ({
    customers: { list: vi.fn(), get: vi.fn(), create: vi.fn() },
    agents: { list: vi.fn(), get: vi.fn(), getByMachineName: vi.fn() },
    tickets: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn() },
    alerts: {
      list: vi.fn(),
      get: vi.fn(),
      listByAgent: vi.fn(),
      listByDevice: vi.fn(),
    },
    contacts: { list: vi.fn(), get: vi.fn(), listByCustomer: vi.fn() },
  }) }),
}));

describe("client utility", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Reset modules to clear cached client
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getClient", () => {
    it("should throw error when ATERA_API_KEY is not set", async () => {
      delete process.env.ATERA_API_KEY;

      const { getClient } = await import("../utils/client.js");

      await expect(getClient()).rejects.toThrow(
        "ATERA_API_KEY environment variable is required"
      );
    });

    it("should create client when ATERA_API_KEY is set", async () => {
      process.env.ATERA_API_KEY = "test-api-key";

      const { getClient } = await import("../utils/client.js");
      const { AteraClient } = await import("@wyre-ai/node-atera");

      const client = await getClient();

      expect(AteraClient).toHaveBeenCalledWith({ apiKey: "test-api-key" });
      expect(client).toBeDefined();
    });

    it("should return same client instance on subsequent calls (lazy loading)", async () => {
      process.env.ATERA_API_KEY = "test-api-key";

      const { getClient } = await import("../utils/client.js");
      const { AteraClient } = await import("@wyre-ai/node-atera");

      const client1 = await getClient();
      const client2 = await getClient();

      // Should only create one instance
      expect(AteraClient).toHaveBeenCalledTimes(1);
      expect(client1).toBe(client2);
    });
  });

  describe("resetClient", () => {
    it("should reset the client instance", async () => {
      process.env.ATERA_API_KEY = "test-api-key";

      const { getClient, resetClient } = await import("../utils/client.js");
      const { AteraClient } = await import("@wyre-ai/node-atera");

      await getClient();
      expect(AteraClient).toHaveBeenCalledTimes(1);

      resetClient();

      await getClient();
      expect(AteraClient).toHaveBeenCalledTimes(2);
    });
  });
});

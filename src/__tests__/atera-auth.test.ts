/**
 * JWT API tokens must leave as Authorization: Bearer.
 * Legacy keys stay on X-API-KEY. See WYRE-AI/atera-mcp#84.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  installJwtAuthFetch,
  isJwtApiKey,
  normalizeApiKey,
} from "../utils/atera-auth.js";

/** Unsigned sample with iss=AteraInterop, aud=apiUsers. Not a live credential. */
const JWT = [
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9",
  "eyJpc3MiOiJBdGVyYUludGVyb3AiLCJhdWQiOiJhcGlVc2VycyJ9",
  "c2lnbmF0dXJl",
].join(".");

describe("isJwtApiKey", () => {
  it("recognizes a JWT and a Bearer-prefixed paste", () => {
    expect(isJwtApiKey(JWT)).toBe(true);
    expect(isJwtApiKey(`  Bearer ${JWT}  `)).toBe(true);
    expect(normalizeApiKey(`Bearer ${JWT}`)).toBe(JWT);
  });

  it("rejects legacy keys", () => {
    expect(isJwtApiKey("test-api-key")).toBe(false);
    expect(isJwtApiKey("notajwt.with.dots")).toBe(false);
    expect(isJwtApiKey("eyJhbGci.only-two")).toBe(false);
  });
});

describe("installJwtAuthFetch", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function captureHeaders(
    headers: Record<string, string>
  ): Promise<Headers> {
    let seen: Headers | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen = new Headers(init?.headers);
      return new Response("[]", { status: 200 });
    }) as typeof fetch;

    installJwtAuthFetch();
    await fetch("https://app.atera.com/api/v3/tickets", { headers });
    if (!seen) {
      throw new Error("patched fetch was not called");
    }
    return seen;
  }

  it("rewrites a JWT X-API-KEY into Authorization Bearer", async () => {
    const headers = await captureHeaders({
      "X-API-KEY": JWT,
      Accept: "application/json",
    });
    expect(headers.get("authorization")).toBe(`Bearer ${JWT}`);
    expect(headers.get("x-api-key")).toBeNull();
    expect(headers.get("accept")).toBe("application/json");
  });

  it("strips a pasted Bearer prefix before sending the token", async () => {
    const headers = await captureHeaders({ "X-API-KEY": `Bearer ${JWT}` });
    expect(headers.get("authorization")).toBe(`Bearer ${JWT}`);
    expect(headers.get("x-api-key")).toBeNull();
  });

  it("leaves a legacy key on X-API-KEY", async () => {
    const headers = await captureHeaders({ "X-API-KEY": "test-api-key" });
    expect(headers.get("x-api-key")).toBe("test-api-key");
    expect(headers.get("authorization")).toBeNull();
  });

  it("does not wrap fetch more than once", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async () => {
      calls.push("origin");
      return new Response("[]", { status: 200 });
    }) as typeof fetch;

    installJwtAuthFetch();
    installJwtAuthFetch();
    await fetch("https://app.atera.com/api/v3/tickets", {
      headers: { "X-API-KEY": JWT },
    });
    expect(calls).toEqual(["origin"]);
  });
});

/**
 * Tests for the invoices domain tool handlers
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoiceTools, handleInvoiceTool } from "../../domains/invoices.js";

const mockClient = {
  billing: {
    listInvoices: vi.fn(),
    getInvoice: vi.fn(),
  },
};

vi.mock("../../utils/client.js", () => ({
  getClient: vi.fn(),
}));

describe("invoices domain", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getClient } = await import("../../utils/client.js");
    vi.mocked(getClient).mockResolvedValue(
      mockClient as unknown as Awaited<ReturnType<typeof getClient>>
    );
  });

  it("exports list and get tools", () => {
    expect(invoiceTools.map((t) => t.name)).toEqual([
      "atera_invoices_list",
      "atera_invoices_get",
    ]);
    expect(invoiceTools[1].inputSchema.required).toContain("invoiceId");
  });

  it("lists invoices with paging params", async () => {
    mockClient.billing.listInvoices.mockResolvedValue({ items: [{ InvoiceID: 1 }] });
    const result = await handleInvoiceTool("atera_invoices_list", { page: 2, itemsInPage: 10 });
    expect(result.isError).toBeUndefined();
    expect(mockClient.billing.listInvoices).toHaveBeenCalledWith({ page: 2, itemsInPage: 10 });
    expect(JSON.parse(result.content[0].text).items).toHaveLength(1);
  });

  it("gets an invoice by id and requires the id", async () => {
    mockClient.billing.getInvoice.mockResolvedValue({ InvoiceID: 7 });
    const ok = await handleInvoiceTool("atera_invoices_get", { invoiceId: 7 });
    expect(ok.isError).toBeUndefined();
    expect(mockClient.billing.getInvoice).toHaveBeenCalledWith(7);
    const bad = await handleInvoiceTool("atera_invoices_get", {});
    expect(bad.isError).toBe(true);
  });

  it("returns an error for an unknown invoice tool", async () => {
    const result = await handleInvoiceTool("atera_invoices_nope", {});
    expect(result.isError).toBe(true);
  });
});

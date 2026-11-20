/**
 * Tests for the contacts domain tool handlers
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { contactTools, handleContactTool } from "../../domains/contacts.js";

// Mock the client utility
const mockClient = {
  contacts: {
    list: vi.fn(),
    get: vi.fn(),
    listByCustomer: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("../../utils/client.js", () => ({
  getClient: vi.fn().mockResolvedValue({
    contacts: {
      list: vi.fn(),
      get: vi.fn(),
      listByCustomer: vi.fn(),
    },
  }),
}));

describe("contacts domain", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getClient } = await import("../../utils/client.js");
    vi.mocked(getClient).mockResolvedValue(
      mockClient as unknown as Awaited<ReturnType<typeof getClient>>
    );
  });

  describe("contactTools", () => {
    it("should export five contact tools", () => {
      expect(contactTools).toHaveLength(5);
    });

    it("should have atera_contacts_list tool", () => {
      const listTool = contactTools.find(
        (t) => t.name === "atera_contacts_list"
      );
      expect(listTool).toBeDefined();
      expect(listTool?.inputSchema.properties).toHaveProperty("page");
      expect(listTool?.inputSchema.properties).toHaveProperty("itemsInPage");
      expect(listTool?.inputSchema.required).toBeUndefined();
    });

    it("should have atera_contacts_get tool with required contactId", () => {
      const getTool = contactTools.find((t) => t.name === "atera_contacts_get");
      expect(getTool).toBeDefined();
      expect(getTool?.inputSchema.properties).toHaveProperty("contactId");
      expect(getTool?.inputSchema.required).toContain("contactId");
    });

    it("should have atera_contacts_by_customer tool with required customerId", () => {
      const customerTool = contactTools.find(
        (t) => t.name === "atera_contacts_by_customer"
      );
      expect(customerTool).toBeDefined();
      expect(customerTool?.inputSchema.properties).toHaveProperty("customerId");
      expect(customerTool?.inputSchema.required).toContain("customerId");
    });
  });

  describe("handleContactTool", () => {
    describe("atera_contacts_list", () => {
      it("should call client.contacts.list with pagination params", async () => {
        const mockResponse = { items: [], totalPages: 1, page: 1 };
        mockClient.contacts.list.mockResolvedValue(mockResponse);

        const result = await handleContactTool("atera_contacts_list", {
          page: 2,
          itemsInPage: 25,
        });

        expect(mockClient.contacts.list).toHaveBeenCalledWith({
          page: 2,
          itemsInPage: 25,
        });
        expect(result.isError).toBeUndefined();
      });

      it("should call client.contacts.list with default params", async () => {
        const mockResponse = { items: [], totalPages: 1, page: 1 };
        mockClient.contacts.list.mockResolvedValue(mockResponse);

        await handleContactTool("atera_contacts_list", {});

        expect(mockClient.contacts.list).toHaveBeenCalledWith({
          page: undefined,
          itemsInPage: undefined,
        });
      });
    });

    describe("atera_contacts_get", () => {
      it("should call client.contacts.get with contactId", async () => {
        const mockContact = {
          ContactID: 123,
          FirstName: "John",
          LastName: "Doe",
          Email: "john@example.com",
        };
        mockClient.contacts.get.mockResolvedValue(mockContact);

        const result = await handleContactTool("atera_contacts_get", {
          contactId: 123,
        });

        expect(mockClient.contacts.get).toHaveBeenCalledWith(123);
        expect(result.content[0].text).toContain("John");
        expect(result.content[0].text).toContain("Doe");
        expect(result.isError).toBeUndefined();
      });
    });

    describe("atera_contacts_by_customer", () => {
      it("should call client.contacts.listByCustomer with customerId and pagination", async () => {
        const mockResponse = { items: [], totalPages: 1, page: 1 };
        mockClient.contacts.listByCustomer.mockResolvedValue(mockResponse);

        const result = await handleContactTool("atera_contacts_by_customer", {
          customerId: 456,
          page: 1,
          itemsInPage: 50,
        });

        expect(mockClient.contacts.listByCustomer).toHaveBeenCalledWith(456, {
          page: 1,
          itemsInPage: 50,
        });
        expect(result.isError).toBeUndefined();
      });

      it("should call client.contacts.listByCustomer with only customerId", async () => {
        const mockResponse = { items: [], totalPages: 1, page: 1 };
        mockClient.contacts.listByCustomer.mockResolvedValue(mockResponse);

        await handleContactTool("atera_contacts_by_customer", {
          customerId: 456,
        });

        expect(mockClient.contacts.listByCustomer).toHaveBeenCalledWith(456, {
          page: undefined,
          itemsInPage: undefined,
        });
      });
    });

    describe("unknown tool", () => {
      it("should return error for unknown contact tool", async () => {
        const result = await handleContactTool("atera_contacts_unknown", {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Unknown contact tool");
      });
    });
  });

  describe("create and update (WYREAI-703)", () => {
    it("creates a contact with Atera's field names", async () => {
      mockClient.contacts.create.mockResolvedValue({ ContactID: 9 });
      const result = await handleContactTool("atera_contacts_create", {
        customerId: 4,
        email: "new.user@example.com",
        firstName: "New",
        lastName: "User",
      });
      expect(result.isError).toBeUndefined();
      expect(mockClient.contacts.create).toHaveBeenCalledWith({
        CustomerID: 4,
        Email: "new.user@example.com",
        FirstName: "New",
        LastName: "User",
        JobTitle: undefined,
        Phone: undefined,
        MobilePhone: undefined,
        IsContactPerson: undefined,
      });
    });

    it("requires customerId and email to create", async () => {
      const result = await handleContactTool("atera_contacts_create", { customerId: 4 });
      expect(result.isError).toBe(true);
      expect(mockClient.contacts.create).not.toHaveBeenCalled();
    });

    it("updates only the fields passed", async () => {
      mockClient.contacts.update.mockResolvedValue({ ContactID: 9 });
      const result = await handleContactTool("atera_contacts_update", {
        contactId: 9,
        jobTitle: "Owner",
      });
      expect(result.isError).toBeUndefined();
      expect(mockClient.contacts.update).toHaveBeenCalledWith(9, {
        Email: undefined,
        FirstName: undefined,
        LastName: undefined,
        JobTitle: "Owner",
        Phone: undefined,
        MobilePhone: undefined,
        IsContactPerson: undefined,
      });
    });

    it("rejects an update with no changes", async () => {
      const result = await handleContactTool("atera_contacts_update", { contactId: 9 });
      expect(result.isError).toBe(true);
      expect(mockClient.contacts.update).not.toHaveBeenCalled();
    });
  });
});

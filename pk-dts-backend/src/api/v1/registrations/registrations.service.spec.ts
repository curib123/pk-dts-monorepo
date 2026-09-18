import { BadRequestException } from "@nestjs/common";
import { RegistrationStatus } from "@prisma/client";
import { RegistrationsService } from "./registrations.service";

describe("RegistrationsService administrative role protection", () => {
  it("removes the canonical Admin role from public registration roles", async () => {
    const prisma = {
      role: {
        findMany: jest.fn().mockResolvedValue([
          { role_id: 1n, role_name: "Admin" },
          { role_id: 2n, role_name: "Records Officer" },
        ]),
      },
    };
    const service = new RegistrationsService(prisma as never);

    await expect(service.publicRoles()).resolves.toEqual([
      { role_id: 2n, role_name: "Records Officer" },
    ]);
  });

  it("rejects the canonical Admin role requested with a crafted registration payload", async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      accountRegistrationRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      role: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ role_id: 1n, role_name: "Admin" }),
      },
    };
    const service = new RegistrationsService(prisma as never);

    await expect(
      service.create({
        firstname: "Test",
        lastname: "User",
        username: "test@example.com",
        password: "password123",
        requested_role_id: "1",
      }),
    ).rejects.toThrow("not available for public registration");
  });

  it("rejects assigning an administrative role during approval", async () => {
    const transaction = {
      accountRegistrationRequest: {
        findUnique: jest.fn().mockResolvedValue({
          registration_id: 1n,
          status: RegistrationStatus.PENDING,
          username: "test@example.com",
        }),
      },
      role: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ role_id: 2n, role_name: "Admin" }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
    };
    const service = new RegistrationsService(prisma as never);

    await expect(
      service.review(
        "1",
        { status: RegistrationStatus.APPROVED, assigned_role_id: "2" },
        "9",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.user.create).not.toHaveBeenCalled();
  });
});

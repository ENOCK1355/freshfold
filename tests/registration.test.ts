import { describe, expect, it } from "vitest";
import { registrationSchema } from "../apps/api/src/identity";

const details = {
  name: "Student Tester",
  email: "student.registration@freshfold.test",
  password: "Student.Registration!2026",
};

describe("registration account types", () => {
  it("ignores empty or stale business fields for students and preserves the default account type", () => {
    for (const companyName of ["", "x", "Previous laundry"]) {
      const account = registrationSchema.parse({
        ...details,
        type: "student",
        companyName,
        areaId: "",
      });
      expect(account.type).toBe("student");
      expect(account).not.toHaveProperty("companyName");
      expect(account).not.toHaveProperty("areaId");
    }
    expect(registrationSchema.parse(details).type).toBe("student");
  });

  it("still requires a valid business name and service area for company accounts", () => {
    for (const companyName of ["", "x", "ab"]) {
      expect(
        registrationSchema.safeParse({
          ...details,
          type: "company",
          companyName,
          areaId: "amamoma",
        }).success,
      ).toBe(false);
    }
    expect(
      registrationSchema.safeParse({
        ...details,
        type: "company",
        companyName: "Cape Laundry",
        areaId: "",
      }).success,
    ).toBe(false);
    expect(
      registrationSchema.parse({
        ...details,
        type: "company",
        companyName: "  Cape Laundry  ",
        areaId: "amamoma",
      }),
    ).toMatchObject({
      type: "company",
      companyName: "Cape Laundry",
      areaId: "amamoma",
    });
  });
});

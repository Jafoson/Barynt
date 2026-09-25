import { describe, expect, it } from "bun:test";
import { AUDIT_ACTIONS, parseTargetLabel } from "@/lib/audit/actions";

// What an answer to a custom field leaves in an issue's history: a registered action, and a label
// the activity feed can split into the field and the two answers even though the field's name and the
// answers may hold a colon of their own.

describe("the entry an answer leaves", () => {
  it("is a registered action, named in the audit list", () => {
    expect(AUDIT_ACTIONS["issue.customField.changed"]).toBe(
      "Custom field changed",
    );
  });

  it("splits into the ticket, the field with the old answer, and the new answer", () => {
    expect(parseTargetLabel("WEB-7: Customer: Acme → Globex")).toEqual({
      ref: "WEB-7",
      before: "Customer: Acme",
      after: "Globex",
    });
  });

  it("splits when the old answer is none, and when the new one is", () => {
    expect(parseTargetLabel("WEB-7: Customer: — → Acme")).toEqual({
      ref: "WEB-7",
      before: "Customer: —",
      after: "Acme",
    });
    expect(parseTargetLabel("WEB-7: Customer: Acme → —")).toEqual({
      ref: "WEB-7",
      before: "Customer: Acme",
      after: "—",
    });
  });
});

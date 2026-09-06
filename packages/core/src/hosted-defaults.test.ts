import { describe, expect, it } from "vitest";
import {
  AUTO_MODEL_LABEL,
  CHIEF_OF_STAFF_NAME,
  CHIEF_OF_STAFF_SPAWN_KEY,
  chiefOfStaffBotInput,
} from "./hosted-defaults.js";

describe("hosted defaults", () => {
  it("creates a starter assistant that inherits the configured model", () => {
    const input = chiefOfStaffBotInput();
    expect(input.name).toBe(CHIEF_OF_STAFF_NAME);
    expect(input.spawnKey).toBe(CHIEF_OF_STAFF_SPAWN_KEY);
    expect(input.modelProvider).toBeNull();
    expect(input.modelId).toBeNull();
    expect(AUTO_MODEL_LABEL).toBe("Auto");
    expect(input.instructions.toLowerCase()).toContain("chief of staff");
  });
});

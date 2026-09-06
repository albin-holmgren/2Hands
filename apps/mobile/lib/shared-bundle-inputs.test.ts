import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { addSharedBundleInputs } = require("../plugins/with-shared-bundle-inputs.js") as {
  addSharedBundleInputs: (contents: string) => string;
};

describe("Android shared bundle inputs", () => {
  it("preserves the generated app root and build configuration across repeated prebuilds", () => {
    const app = 'react { root = file("../..") }\nandroid { namespace "com.example.app" }\n';
    const once = addSharedBundleInputs(app);
    expect(once.startsWith(app)).toBe(true);
    expect(addSharedBundleInputs(once)).toBe(once);
    expect(once.match(/2hands shared bundle inputs/gi)).toHaveLength(1);
  });

  it("tracks workspace sources and dependency resolution outside Expo's app root", () => {
    const result = addSharedBundleInputs("");
    expect(result).toContain('resolve("../../..")');
    expect(result).toContain('fileTree(new File(workspaceRoot, "packages"))');
    expect(result).toContain('include "*/src/**", "*/package.json"');
    expect(result).toContain('new File(workspaceRoot, "pnpm-lock.yaml")');
    expect(result).toContain("PathSensitivity.RELATIVE");
  });

  it("invalidates a cached fixture bundle when the hosted API origin changes", () => {
    expect(addSharedBundleInputs("")).toContain(
      'inputs.property("twohandsApiOrigin", providers.environmentVariable("EXPO_PUBLIC_API_URL").orElse(""))',
    );
  });
});

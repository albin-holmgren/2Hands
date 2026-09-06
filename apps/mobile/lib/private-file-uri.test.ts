import { describe, expect, it } from "vitest";
import { isPrivateFileUri } from "./private-file-uri";

const roots = ["file:///private/app/cache/", "file:///private/app/documents/"];
describe("native draft attachment boundary", () => {
  it("allows only files inside private app directories", () => {
    expect(isPrivateFileUri("file:///private/app/cache/photo%20one.jpg", roots)).toBe(true);
    expect(isPrivateFileUri("file:///private/app/documents/report.txt", roots)).toBe(true);
    for (const uri of [
      "https://example.test/image.png",
      "file://remote/private/app/cache/file.txt",
      "file:///private/app/cache-other/secret.txt",
      "file:///private/app/cache/../secret.txt",
      "file:///private/app/cache/%2e%2e%2fsecret.txt",
      "file:///private/app/cache/%252e%252e/secret.txt?x=1",
      "content://media/image/1",
      "not a URI",
    ])
      expect(isPrivateFileUri(uri, roots)).toBe(false);
  });
});

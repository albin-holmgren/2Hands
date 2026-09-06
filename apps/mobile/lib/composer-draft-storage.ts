import { ATTACHMENT_MAX_BYTES } from "@rakazo/contracts";
import { inferAttachmentMimeType } from "@rakazo/core";
import { File, Paths } from "expo-file-system";
import { configureComposerDraftStorage } from "./composer-drafts";
import { isPrivateFileUri } from "./private-file-uri";

export function initializeComposerDraftStorage() {
  const metadata = new File(Paths.document, "2hands-composer-drafts-v1.json");
  const backup = new File(Paths.document, "2hands-composer-drafts-v1.previous.json");
  const readValid = async (file: File) => {
    if (!file.exists) return null;
    const text = await file.text();
    try {
      const value = JSON.parse(text);
      return value?.version === 1 && Array.isArray(value.drafts) ? text : null;
    } catch {
      return null;
    }
  };
  return configureComposerDraftStorage({
    read: async () => (await readValid(metadata)) ?? readValid(backup),
    write: async (value) => {
      // File.write is not atomic on every native platform. Retain the last
      // complete metadata record if the app is terminated during a write.
      const previous = await readValid(metadata);
      if (previous) backup.write(previous);
      metadata.write(value);
    },
    clear: async () => {
      await Promise.all(
        [metadata, backup].map(async (file) => {
          try {
            if (file.exists) file.delete();
          } catch {
            file.write("");
          }
        }),
      );
    },
    restoreAttachment: async (ref) => {
      if (!isPrivateFileUri(ref.fileUri, [Paths.cache.uri, Paths.document.uri])) return null;
      const mimeType = inferAttachmentMimeType(ref.name, ref.mimeType);
      if (!mimeType) return null;
      const file = new File(ref.fileUri);
      if (!file.exists) return null;
      const size = file.info().size;
      if (typeof size !== "number" || size > ATTACHMENT_MAX_BYTES) return null;
      return {
        id: ref.id,
        name: ref.name,
        mimeType,
        fileUri: ref.fileUri,
        contentBase64: await file.base64(),
        ...(ref.previewUri === ref.fileUri ? { previewUri: ref.fileUri } : {}),
      };
    },
  });
}

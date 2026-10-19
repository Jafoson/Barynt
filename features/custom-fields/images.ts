import "server-only";
import { type FieldOption, toOptions } from "@/lib/custom-fields";
import { resolveAvatarUrl } from "@/lib/storage";

/**
 * The choices of a field with their images turned into URLs a browser can
 * load. The object key stays alongside (`image`): the settings dialog sends
 * it back to keep an image it did not change.
 *
 * Presigned URLs expire, so this runs on every load rather than being
 * stored. Without storage configured, a choice simply has no `imageUrl`.
 */
export async function optionsWithImageUrls(
  raw: unknown,
): Promise<FieldOption[]> {
  const options = toOptions(raw);
  return Promise.all(
    options.map(async (o) =>
      o.image ? { ...o, imageUrl: await resolveAvatarUrl(o.image) } : o,
    ),
  );
}

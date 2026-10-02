/**
 * Cocos uuid compression, shared by the V7 asset generators.
 *
 * Creator serialises an asset reference inside a .prefab/.scene as a *compressed*
 * uuid, not the dashed hex form found in .meta files. A component's `__type__`
 * is the compressed script uuid, which is why hand-writing `'__type__':
 * 'ArtMaterialReference'` produced "Script ... is missing or invalid": the
 * prefab must name the script by its compressed uuid.
 *
 * Layout, derived and verified by round-trip against the project's own
 * WorldArtLibrary.prefab (script uuid 5d591288-... -> 5d591KI7B1N3LjG2kAZfRnF):
 *
 *   compressed = hex[0..5]                          5 hex chars, verbatim
 *              + 9 base64 pairs encoding hex[5..32]  27 nibbles -> 18 chars
 *
 * 5 + 18 = 23 chars. Each base64 pair carries 3 nibbles:
 *   lhs = (n0 << 2) | (n1 >> 2)
 *   rhs = ((n1 & 3) << 4) | n2
 *
 * Note: this is NOT the 22-char base64-of-16-bytes form, and the widely copied
 * 2-char-prefix decoder (used by scripts/audit_wechat_uuid_owner.mjs for reading
 * bundle config uuids) does not invert it. That script reads uuids from built
 * bundle configs and is unaffected; this module is for *writing* prefabs.
 */

const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_VALUES = new Array(123).fill(0);
for (let i = 0; i < BASE64_KEYS.length; i += 1) BASE64_VALUES[BASE64_KEYS.charCodeAt(i)] = i;

/** 32 hex chars (dashes optional) -> 23-char compressed uuid. */
export function compressUuid(uuid) {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) throw new Error('[uuid] expected 32 hex chars, got ' + uuid);

  let out = hex.slice(0, 5);
  for (let i = 5; i < 32; i += 3) {
    const n0 = parseInt(hex[i], 16);
    const n1 = parseInt(hex[i + 1], 16);
    const n2 = parseInt(hex[i + 2], 16);
    out += BASE64_KEYS[(n0 << 2) | (n1 >> 2)];
    out += BASE64_KEYS[((n1 & 3) << 4) | n2];
  }
  return out;
}

/**
 * Inverse of compressUuid: 23-char compressed uuid -> dashed hex.
 *
 * Note this is the *prefab* form. Built bundle configs use a different, 22-char
 * form (base64 of the 16 raw bytes with a 2-char prefix), decoded by the
 * long-standing `decodeUuid` in scripts/audit_wechat_uuid_owner.mjs. Both
 * coexist; do not mix them.
 */
export function decompressUuid(compressed) {
  if (compressed.length !== 23) return compressed;
  let hex = compressed.slice(0, 5);
  for (let i = 5; i < 23; i += 2) {
    const lhs = BASE64_VALUES[compressed.charCodeAt(i)];
    const rhs = BASE64_VALUES[compressed.charCodeAt(i + 1)];
    hex += (lhs >> 2).toString(16);
    hex += (((lhs & 3) << 2) | (rhs >> 4)).toString(16);
    hex += (rhs & 15).toString(16);
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

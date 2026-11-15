import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import id from "../messages/id.json";
import ja from "../messages/ja.json";
import { ERROR_CODES } from "@/lib/errors/AppError";

type Tree = { [key: string]: string | Tree };
const ALL: Record<string, Tree> = { en, id, ja };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((out, [k, v]) => {
    if (typeof v === "string") out[`${prefix}${k}`] = v;
    else Object.assign(out, flatten(v, `${prefix}${k}.`));
    return out;
  }, {});
}
/** Variables a message uses, ignoring plural branch words such as {one} or {other}. */
const vars = (msg: string) => [...new Set([...msg.matchAll(/(?<!one )(?<!other )\{(\w+)[,}]/g)].map((m) => m[1]))].sort();

describe("translations", () => {
  const base = flatten(en);

  for (const locale of ["id", "ja"]) {
    it(`${locale} has exactly the same keys and variables as English`, () => {
      const other = flatten(ALL[locale]);
      expect(Object.keys(other).sort()).toEqual(Object.keys(base).sort());
      for (const key of Object.keys(base)) expect(vars(other[key]), `${locale}:${key}`).toEqual(vars(base[key]));
    });
  }

  for (const locale of ["en", "id", "ja"]) {
    it(`every ${locale} message is valid ICU syntax and formats with sample values`, () => {
      for (const [key, msg] of Object.entries(flatten(ALL[locale]))) {
        const values = Object.fromEntries(vars(msg).map((v) => [v, 2]));
        expect(() => new IntlMessageFormat(msg, locale).format(values), `${locale}:${key}`).not.toThrow();
      }
    });
  }

  it("has a title and hint for every error code in every language", () => {
    for (const locale of ["en", "id", "ja"]) {
      const flat = flatten(ALL[locale]);
      for (const code of ERROR_CODES) {
        expect(flat[`err.${code}.title`], `${locale}:${code}`).toBeTruthy();
        expect(flat[`err.${code}.hint`], `${locale}:${code}`).toBeTruthy();
      }
    }
  });

  it("does not leave English text in the other languages by accident", () => {
    const idFlat = flatten(id);
    const jaFlat = flatten(ja);
    const keep = new Set(["item.noteCount", "detail.saved", "detail.packaged", "detail.read", "backup.doneBody", "item.label", "field.label", "diff.label", "legal.license", "err.BACKUP_UNEXPECTED_CONTENT.hint", "detail.unpacked", "detail.metadata", "detail.checksum", "view.board", "privacy.hosting.title"]);
    for (const [key, text] of Object.entries(base)) {
      if (keep.has(key) || /^\{[^}]*\}$/.test(text) || text.length < 5) continue;
      expect(idFlat[key], `id:${key}`).not.toBe(text);
      expect(jaFlat[key], `ja:${key}`).not.toBe(text);
    }
  });
});

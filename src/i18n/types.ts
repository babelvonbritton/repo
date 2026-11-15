import type en from "../../messages/en.json";

type Flatten<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Flatten<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every message key, derived from the English file so typos fail the typecheck. */
export type MessageKey = Flatten<typeof en>;

/** A message key with its values, produced by non-UI code and translated when displayed. */
export interface Msg {
  key: MessageKey;
  vars?: Record<string, string | number>;
}

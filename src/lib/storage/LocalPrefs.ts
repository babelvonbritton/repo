/** Safe wrapper over localStorage for tiny UI preferences (never for board data). */
export class LocalPrefs {
  private static readonly PREFIX = "repo.";

  /** Set by the app to route failures into the error system; falls back to the console. */
  static onError: ((error: unknown, action: string) => void) | null = null;

  private static fail(error: unknown, action: string): void {
    if (LocalPrefs.onError) LocalPrefs.onError(error, action);
    else console.error(`[Repo] ${action}`, error);
  }

  static get(key: string): string | null {
    try {
      return typeof localStorage === "undefined" ? null : localStorage.getItem(LocalPrefs.PREFIX + key);
    } catch (error) {
      LocalPrefs.fail(error, "prefs.read");
      return null;
    }
  }

  static set(key: string, value: string): void {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(LocalPrefs.PREFIX + key, value);
    } catch (error) {
      LocalPrefs.fail(error, "prefs.write");
    }
  }
}

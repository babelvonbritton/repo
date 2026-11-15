import type { Table } from "dexie";
import type { Clock } from "./types";

/** Generic CRUD shared by every repository; subclasses add store-specific queries. */
export abstract class BaseRepository<T, K extends string> {
  constructor(protected readonly table: Table<T, K>, protected readonly clock: Clock = Date.now) {}

  get(key: K): Promise<T | undefined> {
    return this.table.get(key);
  }

  all(): Promise<T[]> {
    return this.table.toArray();
  }

  count(): Promise<number> {
    return this.table.count();
  }

  put(record: T): Promise<K> {
    return this.table.put(record);
  }

  remove(key: K): Promise<void> {
    return this.table.delete(key);
  }
}

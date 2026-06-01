/**
 * @fileoverview BaseRepository — shared Supabase error handling for all
 * scribe repositories. Does NOT contain domain logic.
 */

import { DatabaseError } from "../errors.js";
import { createLogger } from "../logger.js";

export class BaseRepository {
  /**
   * @param {import("@supabase/supabase-js").SupabaseClient} supabase
   * @param {string} tableName
   */
  constructor(supabase, tableName) {
    this._db        = supabase;
    this._table     = tableName;
    this._log       = createLogger({ component: `${tableName}Repository` });
  }

  /**
   * Executes a Supabase query builder and throws DatabaseError on failure.
   *
   * @template T
   * @param {() => Promise<{ data: T|null; error: import("@supabase/supabase-js").PostgrestError|null }>} queryFn
   * @param {string} operation - Human-readable operation name for logging
   * @returns {Promise<T>}
   */
  async _run(queryFn, operation) {
    const { data, error } = await queryFn();
    if (error) {
      this._log.error(`DB error during ${operation}`, {
        operation,
        table:   this._table,
        code:    error.code,
        details: error.details,
        // Deliberately NOT logging error.message to avoid leaking schema details to log aggregators
      });
      throw new DatabaseError(operation, error);
    }
    return data;
  }

  /**
   * Same as _run but returns null instead of throwing when nothing is found
   * (i.e., when Supabase returns PGRST116 "row not found").
   *
   * @template T
   * @param {() => Promise<{ data: T|null; error: import("@supabase/supabase-js").PostgrestError|null }>} queryFn
   * @param {string} operation
   * @returns {Promise<T|null>}
   */
  async _runNullable(queryFn, operation) {
    const { data, error } = await queryFn();
    if (error) {
      // PGRST116 = "Searched for one row but found none" — treat as null
      if (error.code === "PGRST116") return null;
      this._log.error(`DB error during ${operation}`, {
        operation,
        table: this._table,
        code:  error.code,
      });
      throw new DatabaseError(operation, error);
    }
    return data;
  }
}

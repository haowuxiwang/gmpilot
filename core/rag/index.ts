/**
 * Shared RAG retriever singleton.
 * Used by both knowledge IPC and workflow to avoid duplicate initialization.
 */

import type Database from 'better-sqlite3';
import { Retriever } from './retriever';

let retriever: Retriever | null = null;
let db: Database.Database | null = null;

/**
 * Initialize the shared retriever with a database connection.
 * Must be called once during app startup.
 */
export async function initRetriever(database: Database.Database): Promise<Retriever> {
  if (retriever && db === database) return retriever;

  db = database;
  retriever = new Retriever(database);
  await retriever.initialize();
  return retriever;
}

/**
 * Get the shared retriever instance.
 * Throws if not initialized.
 */
export function getRetriever(): Retriever {
  if (!retriever) {
    throw new Error('Retriever not initialized. Call initRetriever() first.');
  }
  return retriever;
}

/**
 * Check if retriever is available.
 */
export function isRetrieverAvailable(): boolean {
  return retriever !== null;
}

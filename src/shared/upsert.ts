//True for MongoDB's duplicate-key error (11000).
export const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;

//Runs an upsert, retrying once if a parallel request inserted the same row first.
export const upsertWithRetry = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    if (isDuplicateKey(error)) return run();
    throw error;
  }
};

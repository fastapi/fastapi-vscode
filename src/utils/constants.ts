/**
 * Max concurrent workspace file reads. Bounds `pMap` fan-out so large
 * workspaces don't open thousands of file handles at once. Shared by every
 * path that scans and reads `.py` files (app discovery, test indexing).
 */
export const READ_CONCURRENCY = 50

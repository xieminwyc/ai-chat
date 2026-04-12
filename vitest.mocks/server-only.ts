/**
 * Mock for Next.js server-only module
 *
 * In test environment, server-only doesn't need to do anything.
 * This mock prevents import errors when testing code that imports server-only.
 */

// Empty export - server-only is a build-time check only
export {};

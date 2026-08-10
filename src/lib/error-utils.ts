/**
 * Extracts the most detailed error message from various error structures
 * @param err - The error object, can be Error instance or any other object
 * @param defaultMessage - Default message if no specific error message is found
 * @returns The extracted error message
 */
export function extractErrorMessage(err: unknown, defaultMessage: string = 'An error occurred'): string {
  if (err instanceof Error) {
    return err.message;
  }

  if (typeof err === 'object' && err !== null) {
    // Try to extract from various possible error structures
    const value = err as { message?: unknown; error?: unknown; payload?: { message?: unknown; error?: unknown }; statusText?: unknown };
    return (typeof value.message === 'string' && value.message) ||
           (typeof value.error === 'string' && value.error) ||
           (typeof value.payload?.message === 'string' && value.payload.message) ||
           (typeof value.payload?.error === 'string' && value.payload.error) ||
           (typeof value.statusText === 'string' && value.statusText) ||
           defaultMessage;
  }

  return defaultMessage;
}

/**
 * Logs the error and extracts a user-friendly error message
 * @param err - The error object
 * @param context - Context string for debugging (e.g., 'Context creation error')
 * @param defaultMessage - Default message if no specific error message is found
 * @returns The extracted error message
 */
export function logAndExtractError(err: unknown, context: string, defaultMessage: string = 'An error occurred'): string {
  console.error(context, err);
  return extractErrorMessage(err, defaultMessage);
}

/** Loose shape of the error-like objects our API layers throw around. */
interface ErrorLike {
  message?: string;
  error?: string;
  statusText?: string;
  payload?: { message?: string; error?: string };
}

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
    const e = err as ErrorLike;
    // Try to extract from various possible error structures
    return e.message ||
           e.error ||
           e.payload?.message ||
           e.payload?.error ||
           e.statusText ||
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

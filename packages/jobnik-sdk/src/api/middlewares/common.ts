const PATH_SEGMENT_MIN_COUNT = 2; // Minimum segments for resource extraction (e.g., /jobs/{id})

export interface ErrorContext {
  readonly url: string;
  readonly method: string;
}

/**
 * Extracts resource information from URL path for better 404 error messages
 */
export const extractResourceInfo = (url: string): { resourceType: string; resourceId: string } => {
  const urlPath = new URL(url).pathname;
  const pathSegments = urlPath.split('/').filter(Boolean);

  let resourceType = 'Resource';
  let resourceId = 'unknown';

  // For Job Manager Service API: /jobs/{id}, /stages/{id}, /tasks/{id}
  if (pathSegments.length >= PATH_SEGMENT_MIN_COUNT) {
    const typeSegment = pathSegments[pathSegments.length - PATH_SEGMENT_MIN_COUNT]; // e.g., 'jobs', 'stages', 'tasks'
    const idSegment = pathSegments[pathSegments.length - 1]; // e.g., job ID

    if (typeSegment !== undefined && typeSegment.length > 0) {
      // Convert plural to singular and capitalize
      resourceType = typeSegment.endsWith('s')
        ? // eslint-disable-next-line @typescript-eslint/no-magic-numbers
          typeSegment.slice(0, -1).charAt(0).toUpperCase() + typeSegment.slice(1, -1)
        : typeSegment.charAt(0).toUpperCase() + typeSegment.slice(1);
    }

    if (idSegment !== undefined && idSegment.length > 0) {
      resourceId = idSegment;
    }
  }

  return { resourceType, resourceId };
};

/**
 * Parses error response body to extract error message from Job Manager Service
 */
export const parseErrorResponse = async (response: Response, context: ErrorContext): Promise<string> => {
  const { url, method } = context;
  let errorMessage = `HTTP ${response.status} error for ${method} ${url}`;

  try {
    const responseText = await response.clone().text();
    if (responseText) {
      try {
        const errorBody = JSON.parse(responseText) as { message?: string };

        // Extract message from Job Manager Service error response format
        if (errorBody.message !== undefined && typeof errorBody.message === 'string') {
          errorMessage = `${errorMessage}: ${errorBody.message}`;
        }
      } catch {
        // If JSON parsing fails, include raw response text if it's short enough
        const MAX_ERROR_TEXT_LENGTH = 200;
        if (responseText.length <= MAX_ERROR_TEXT_LENGTH) {
          errorMessage = `${errorMessage}: ${responseText}`;
        }
      }
    }
  } catch {
    // Ignore errors when trying to read response body
  }

  return errorMessage;
};

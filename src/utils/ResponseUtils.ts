import { Response } from 'express';

class ResponseUtils {
  static success(res: Response, message: string, data: unknown = null, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      ...(data !== null && data !== undefined ? { data } : {}),
    });
  }

  static error(res: Response, message: string, error: unknown = null, statusCode = 500) {
    const errorPayload = error instanceof Error ? error.message : error;

    return res.status(statusCode).json({
      success: false,
      message,
      ...(error ? { error: errorPayload } : {}),
    });
  }
}

export default ResponseUtils;

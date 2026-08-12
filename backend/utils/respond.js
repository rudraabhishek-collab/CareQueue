/**
 * Wraps a successful response in the standard `{ data }` envelope.
 *
 * @param {import('express').Response} res - Express response object.
 * @param {*} data - Payload to return to the client.
 * @param {number} [status] - HTTP status code (default 200).
 * @returns {import('express').Response} The response object.
 */
export function success(res, data, status = 200) {
  return res.status(status).json({ data });
}

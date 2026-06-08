export function informationUnavailable(reason) {
  return { status: 'information_unavailable', reason };
}

export async function safeCall(fn, context) {
  try {
    return await fn();
  } catch (err) {
    return informationUnavailable(`${context}: ${err.message}`);
  }
}

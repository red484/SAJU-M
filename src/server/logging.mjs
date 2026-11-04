const errorCodes = new Set(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','EPIPE','ENOENT','EACCES','EPERM','ERR_STREAM_PREMATURE_CLOSE',
  '23505','23503','23502','22P02','40001','40P01','53300','53200','53100','55P03','57014','57P01','08000','08003','08006','08001','08P01','42P01','42703','42501','42601','XX000']);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;

// Never serialize upstream messages, stacks, response bodies or authentication data.
export function errorDetails(error) {
  const code = errorCodes.has(error?.code) ? error.code : 'UNKNOWN';
  return { code, ...(Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? { status: error.status } : {}) };
}

export function llmLogDetails(shape) {
  return {
    inputTokens: count(shape.usage?.in),
    outputTokens: count(shape.usage?.out),
    finishReason: ['stop','length','content_filter','tool_calls','function_call'].includes(shape.finishReason) ? shape.finishReason : 'unknown',
    truncated: shape.truncated === true,
    continuations: count(shape.continuations),
    faults: count(shape.faults),
    qualityIssueCount: Array.isArray(shape.qualityIssues) ? shape.qualityIssues.length : undefined
  };
}

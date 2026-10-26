const { classifyAIError } = require('./generation');

// Local Node has no 60-second function cap. Vercel retains a conservative host budget.
// Retrying an unavailable upstream needs a full inference window, unlike a format repair.
function getRequestPolicy(env = process.env) {
    const configured = env.GEMINI_CREATIVE_TIMEOUT_MS?.trim();
    const totalMs = configured ? Number(configured) : env.VERCEL ? 55000 : 100000;
    if (!Number.isInteger(totalMs) || totalMs < 30000 || totalMs > 300000) {
        throw Object.assign(new Error('GEMINI_CREATIVE_TIMEOUT_MS must be an integer between 30000 and 300000'), { code: 'AI_SCHEMA_ERROR' });
    }
    const recoveryMs = totalMs >= 80000 ? 25000 : 20000;
    const initialMs = Math.min(60000, totalMs - recoveryMs);
    return Object.freeze({ totalMs, initialMs, retryMs: initialMs, recoveryMs, minimumRecoveryMs: 10000, backoffMs: 500, upstreamGraceMs: 10000 });
}
const policy = getRequestPolicy({});
const failure = (code, message) => Object.assign(new Error(message), { code });
function classifyCreativeError(error) {
    const status = Number(error?.status || error?.error?.code || error?.code);
    const message = String(error?.message || '');
    const codes = {
        AI_REQUEST_CANCELLED: [499, '討論已中斷；你的選擇已保留。'],
        AI_UPSTREAM_TIMEOUT: [504, '思考時間較長，請重試；你的選擇已保留。'],
        AI_NETWORK_FAILURE: [503, '連線暫時中斷，請重試；你的選擇已保留。'],
        AI_UPSTREAM_UNAVAILABLE: [503, 'Ask Gemini 服務暫時無法使用，請稍後重試。'],
        AI_SCHEMA_ERROR: [502, 'Ask Gemini 的輸出設定不受支援，請檢查後端設定。'],
        AI_INCOMPLETE_RESPONSE: [502, '創作建議尚未完整產生；你的選擇已保留，可稍後重試。']
    };
    let code = error?.code;
    if (!codes[code]) {
        // A real HTTP status takes precedence over incidental words in an upstream message.
        if (status === 504) code = 'AI_UPSTREAM_TIMEOUT';
        else if (status >= 500) code = 'AI_UPSTREAM_UNAVAILABLE';
        else if ([401, 403, 404, 429].includes(status)) return classifyAIError(error);
        else if (status === 400 && /schema|thinking|includeThoughts|INVALID_ARGUMENT/i.test(message)) code = 'AI_SCHEMA_ERROR';
        else if (error?.name === 'AbortError' || /timeout|timed out|ETIMEDOUT/i.test(message)) code = 'AI_UPSTREAM_TIMEOUT';
        else if (/fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)) code = 'AI_NETWORK_FAILURE';
    }
    if (codes[code]) return { status: codes[code][0], code, message: codes[code][1] };
    return classifyAIError(error);
}

// Own both the deadline and the signal: SDK AbortError alone does not identify user cancellation.
async function callWithinDeadline(client, args, milliseconds, signal, upstreamGraceMs = 10000) {
    const controller = new AbortController();
    let timer, onAbort;
    const stopped = new Promise((resolve, reject) => {
        onAbort = () => {
            const error = failure('AI_REQUEST_CANCELLED', 'Caller disconnected');
            controller.abort(error); reject(error);
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) return onAbort();
        timer = setTimeout(() => {
            const error = Object.assign(failure('AI_UPSTREAM_TIMEOUT', 'Creative request deadline exceeded'), { timeoutSource: 'application_deadline', timeoutMs: milliseconds });
            controller.abort(error); reject(error);
        }, milliseconds);
    });
    try {
        if (signal?.aborted) return await stopped;
        return await Promise.race([stopped, client.models.generateContent({ ...args, config: { ...args.config,
            // SDK timeout also becomes X-Server-Timeout. Do not let the upstream truncate
            // inference before our application deadline; our own timer remains authoritative.
            abortSignal: controller.signal, httpOptions: { timeout: milliseconds + upstreamGraceMs, retryOptions: { attempts: 1 } } } })]);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

function sleep(milliseconds, signal) {
    return new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(failure('AI_REQUEST_CANCELLED', 'Caller disconnected')); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, milliseconds);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
    });
}
module.exports = { policy, getRequestPolicy, classifyCreativeError, callWithinDeadline, sleep };

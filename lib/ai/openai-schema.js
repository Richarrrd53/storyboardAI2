/**
 * OpenAI Structured Outputs (strict: true) JSON Schema adapter and response normalizer.
 * Converts StoryboardAI's Gemini-compatible schemas into OpenAI strict-mode schemas
 * without altering the underlying business contract, and strips null placeholders
 * back to the canonical StoryboardAI shape before shared validation runs.
 */

const UNSUPPORTED_STRICT_KEYWORDS = new Set([
    'minLength',
    'maxLength',
    'pattern',
    'minimum',
    'maximum',
    'minItems',
    'maxItems'
]);

function makeNullable(node) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node.anyOf)) {
        const hasNull = node.anyOf.some(branch => branch && branch.type === 'null');
        return hasNull ? node : { anyOf: [...node.anyOf, { type: 'null' }] };
    }
    if (Array.isArray(node.type)) {
        return node.type.includes('null') ? node : { ...node, type: [...node.type, 'null'] };
    }
    if (node.enum || node.type === 'object' || node.type === 'array' || node.properties || node.items) {
        return { anyOf: [node, { type: 'null' }] };
    }
    if (typeof node.type === 'string' && node.type !== 'null') {
        return { ...node, type: [node.type, 'null'] };
    }
    return node;
}

function convertNode(node) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(convertNode);

    const out = {};
    for (const [key, value] of Object.entries(node)) {
        if (UNSUPPORTED_STRICT_KEYWORDS.has(key)) continue;
        if (key === 'properties' || key === 'items' || key === 'anyOf') continue;
        out[key] = value;
    }

    if (Array.isArray(node.anyOf)) {
        out.anyOf = node.anyOf.map(convertNode);
    }

    if (node.items) {
        out.items = convertNode(node.items);
    }

    const isObject = node.type === 'object'
        || (Array.isArray(node.type) && node.type.includes('object'))
        || Boolean(node.properties);

    if (isObject && node.properties && typeof node.properties === 'object') {
        const originalRequired = new Set(Array.isArray(node.required) ? node.required : []);
        const nextProperties = {};
        const allKeys = Object.keys(node.properties);

        for (const propKey of allKeys) {
            const convertedProp = convertNode(node.properties[propKey]);
            nextProperties[propKey] = originalRequired.has(propKey)
                ? convertedProp
                : makeNullable(convertedProp);
        }

        out.properties = nextProperties;
        out.required = allKeys;
        out.additionalProperties = false;
    } else if (isObject) {
        out.additionalProperties = false;
        if (!Array.isArray(out.required)) out.required = [];
    }

    return out;
}

function toOpenAIStrictSchema(schema) {
    return convertNode(schema);
}

/**
 * Removes null values from optional fields so OpenAI strict-mode outputs match
 * StoryboardAI's canonical business contract before shared validation runs.
 */
function stripNullsDeep(value) {
    if (Array.isArray(value)) {
        return value.map(stripNullsDeep);
    }
    if (value && typeof value === 'object') {
        const out = {};
        for (const [key, entry] of Object.entries(value)) {
            if (entry === null) continue;
            out[key] = stripNullsDeep(entry);
        }
        return out;
    }
    return value;
}

function normalizeOpenAIStructuredData(data) {
    if (!data || typeof data !== 'object') return data;
    return stripNullsDeep(data);
}

module.exports = {
    toOpenAIStrictSchema,
    normalizeOpenAIStructuredData
};

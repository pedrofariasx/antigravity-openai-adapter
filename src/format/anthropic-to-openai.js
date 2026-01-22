/**
 * Anthropic to OpenAI Response Converter
 * Converts Anthropic Messages API responses to OpenAI Chat Completions format
 */

import crypto from 'crypto';
import { logger } from '../utils/logger.js';

/**
 * Map Anthropic stop reasons to OpenAI finish reasons
 * @param {string} stopReason - Anthropic stop reason
 * @returns {string} - OpenAI finish reason
 */
function mapFinishReason(stopReason) {
    const reasonMap = {
        'end_turn': 'stop',
        'stop_sequence': 'stop',
        'max_tokens': 'length',
        'tool_use': 'tool_calls'
    };
    return reasonMap[stopReason] || 'stop';
}

/**
 * Convert Anthropic content blocks to OpenAI message format
 * @param {Array} content - Anthropic content blocks
 * @returns {{ message: Object, hasToolCalls: boolean }}
 */
function convertContent(content) {
    let textContent = '';
    const toolCalls = [];
    let hasThinking = false;
    let thinkingContent = '';

    if (!content || !Array.isArray(content)) {
        return {
            message: { role: 'assistant', content: '' },
            hasToolCalls: false
        };
    }

    for (const block of content) {
        switch (block.type) {
            case 'text':
                textContent += block.text;
                break;

            case 'thinking':
                // Store thinking content - can be exposed via custom field
                hasThinking = true;
                thinkingContent += block.thinking;
                break;

            case 'tool_use':
                toolCalls.push({
                    id: block.id,
                    type: 'function',
                    function: {
                        name: block.name,
                        arguments: JSON.stringify(block.input || {})
                    }
                });
                break;
        }
    }

    const message = {
        role: 'assistant',
        content: textContent || null
    };

    // Add tool_calls if present
    if (toolCalls.length > 0) {
        message.tool_calls = toolCalls;
        // OpenAI sets content to null when there are tool calls
        if (!textContent) {
            message.content = null;
        }
    }

    // Handle thinking/reasoning content
    if (hasThinking && thinkingContent) {
        // Option 1: Custom field (compatible with many third-party tools)
        message._thinking = thinkingContent;
        
        // Option 2: OpenAI 'reasoning_content' field (used by O1/DeepSeek-style tools)
        message.reasoning_content = thinkingContent;
        
        // Option 3: Prepend to content if requested or as fallback
        // message.content = `<thought>\n${thinkingContent}\n</thought>\n\n${message.content || ''}`;
    }

    return {
        message,
        hasToolCalls: toolCalls.length > 0
    };
}

/**
 * Convert Anthropic Messages response to OpenAI Chat Completions format
 * @param {Object} anthropicResponse - Anthropic Messages API response
 * @param {string} requestModel - The model requested (for response)
 * @returns {Object} - OpenAI Chat Completions format response
 */
export function convertAnthropicToOpenAI(anthropicResponse, requestModel) {
    const {
        id,
        content,
        model,
        stop_reason,
        usage
    } = anthropicResponse;

    const { message, hasToolCalls } = convertContent(content);
    const finishReason = mapFinishReason(stop_reason);

    // Generate unique IDs
    const responseId = `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;
    const created = Math.floor(Date.now() / 1000);

    const openaiResponse = {
        id: responseId,
        object: 'chat.completion',
        created,
        model: requestModel || model,
        choices: [
            {
                index: 0,
                message,
                logprobs: null,
                finish_reason: finishReason
            }
        ],
        usage: {
            prompt_tokens: usage?.input_tokens || 0,
            completion_tokens: usage?.output_tokens || 0,
            total_tokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0)
        },
        system_fingerprint: null
    };

    // Add cache usage info if available (OpenAI extension)
    if (usage?.cache_read_input_tokens || usage?.cache_creation_input_tokens) {
        openaiResponse.usage.prompt_tokens_details = {
            cached_tokens: usage.cache_read_input_tokens || 0
        };
    }

    logger.debug(`[Anthropic→OpenAI] Converted response: ${finishReason}, tokens: ${openaiResponse.usage.total_tokens}`);

    return openaiResponse;
}

/**
 * Convert Anthropic streaming event to OpenAI streaming format
 * @param {Object} anthropicEvent - Anthropic SSE event
 * @param {string} requestModel - The requested model name
 * @param {Object} state - Streaming state (to track accumulated data)
 * @returns {Array<Object>} - Array of OpenAI SSE events to send
 */
export function convertStreamEvent(anthropicEvent, requestModel, state = {}) {
    const events = [];
    const eventType = anthropicEvent.type;
    const responseId = state.responseId || `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;
    const created = state.created || Math.floor(Date.now() / 1000);

    // Update state
    state.responseId = responseId;
    state.created = created;

    switch (eventType) {
        case 'message_start':
            // Send initial chunk with role
            events.push({
                id: responseId,
                object: 'chat.completion.chunk',
                created,
                model: requestModel,
                choices: [{
                    index: 0,
                    delta: { role: 'assistant', content: '' },
                    logprobs: null,
                    finish_reason: null
                }]
            });
            break;

        case 'content_block_start':
            const block = anthropicEvent.content_block;
            if (block?.type === 'tool_use') {
                // Start of a tool call
                state.currentToolCall = {
                    index: state.toolCallIndex || 0,
                    id: block.id,
                    type: 'function',
                    function: {
                        name: block.name,
                        arguments: ''
                    }
                };
                state.toolCallIndex = (state.toolCallIndex || 0) + 1;

                events.push({
                    id: responseId,
                    object: 'chat.completion.chunk',
                    created,
                    model: requestModel,
                    choices: [{
                        index: 0,
                        delta: {
                            tool_calls: [{
                                index: state.currentToolCall.index,
                                id: block.id,
                                type: 'function',
                                function: {
                                    name: block.name,
                                    arguments: ''
                                }
                            }]
                        },
                        logprobs: null,
                        finish_reason: null
                    }]
                });
            }
            break;

        case 'content_block_delta':
            const delta = anthropicEvent.delta;
            
            if (delta?.type === 'text_delta' && delta.text) {
                // Text content
                events.push({
                    id: responseId,
                    object: 'chat.completion.chunk',
                    created,
                    model: requestModel,
                    choices: [{
                        index: 0,
                        delta: { content: delta.text },
                        logprobs: null,
                        finish_reason: null
                    }]
                });
            } else if (delta?.type === 'thinking_delta' && delta.thinking) {
                // Thinking content streamed via reasoning_content delta
                events.push({
                    id: responseId,
                    object: 'chat.completion.chunk',
                    created,
                    model: requestModel,
                    choices: [{
                        index: 0,
                        delta: { reasoning_content: delta.thinking },
                        logprobs: null,
                        finish_reason: null
                    }]
                });
            } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
                // Tool call arguments being streamed
                if (state.currentToolCall) {
                    events.push({
                        id: responseId,
                        object: 'chat.completion.chunk',
                        created,
                        model: requestModel,
                        choices: [{
                            index: 0,
                            delta: {
                                tool_calls: [{
                                    index: state.currentToolCall.index,
                                    function: {
                                        arguments: delta.partial_json
                                    }
                                }]
                            },
                            logprobs: null,
                            finish_reason: null
                        }]
                    });
                }
            }
            break;

        case 'content_block_stop':
            // Content block ended
            state.currentToolCall = null;
            break;

        case 'message_delta':
            // Message-level updates (stop_reason, usage)
            if (anthropicEvent.delta?.stop_reason) {
                const finishReason = mapFinishReason(anthropicEvent.delta.stop_reason);
                events.push({
                    id: responseId,
                    object: 'chat.completion.chunk',
                    created,
                    model: requestModel,
                    choices: [{
                        index: 0,
                        delta: {},
                        logprobs: null,
                        finish_reason: finishReason
                    }]
                });
            }
 
            // Include usage in final chunk if available
            if (anthropicEvent.usage) {
                state.usage = {
                    prompt_tokens: anthropicEvent.usage.input_tokens || 0,
                    completion_tokens: anthropicEvent.usage.output_tokens || 0,
                    total_tokens: (anthropicEvent.usage.input_tokens || 0) + (anthropicEvent.usage.output_tokens || 0)
                };

                // OpenAI expects a final chunk with usage if stream_options: { include_usage: true } is set
                // or just to have usage in the last choice block.
                events.push({
                    id: responseId,
                    object: 'chat.completion.chunk',
                    created,
                    model: requestModel,
                    choices: [], // Usage chunks often have empty choices
                    usage: state.usage
                });
            }
            break;

        case 'message_stop':
            // Stream complete - send [DONE]
            // The actual [DONE] marker is handled by the streaming logic
            break;

        case 'error':
            // Error event
            logger.error(`[Anthropic→OpenAI] Stream error: ${JSON.stringify(anthropicEvent.error)}`);
            break;
    }

    return events;
}

/**
 * Create an OpenAI-format error response
 * @param {string} message - Error message
 * @param {string} type - Error type
 * @param {number} status - HTTP status code
 * @returns {Object} - OpenAI error format
 */
export function createErrorResponse(message, type = 'invalid_request_error', status = 400) {
    return {
        error: {
            message,
            type,
            param: null,
            code: null
        }
    };
}

export default {
    convertAnthropicToOpenAI,
    convertStreamEvent,
    createErrorResponse,
    mapFinishReason
};
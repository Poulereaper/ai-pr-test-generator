// Simple token estimator without WebAssembly dependencies
// Uses character-based estimation that works well for GitHub Actions

/**
 * Estimate the number of tokens in a text input.
 * Ratio is based on average characters per token.
* Update in the future if the tokenizer Lib are eseasier to use.
 */
function estimateTokensFromText(input: string): number {
  // Clean the input by removing the end-of-text token
  const cleanInput = input.replace(/<\|endoftext\|>/g, '');
  
  // Estimate the number of tokens based on average characters per token
  // Average is around 3.8 characters per token for English text
  const avgCharsPerToken = 3.8;
  
  // Count the number of characters in the cleaned input
  const charCount = cleanInput.length;
  
  return Math.ceil(charCount / avgCharsPerToken);
}

function createMockEncoding(input: string): Uint32Array {
  const tokenCount = estimateTokensFromText(input);
  return new Uint32Array(Array.from({length: tokenCount}, (_, i) => i + 1));
}

export function encode_OpenAI(input: string): Uint32Array {
  return createMockEncoding(input);
}

export function getTokenCount_OpenAI(input: string): number {
  return estimateTokensFromText(input);
}

export function encode_Claude(input: string): Uint32Array {
  return createMockEncoding(input);
}

export function getTokenCount_Claude(input: string): number {
  return estimateTokensFromText(input);
}

export function encode_Mistral(input: string): Uint32Array {
  return createMockEncoding(input);
}

export function getTokenCount_Mistral(input: string): number {
  return estimateTokensFromText(input);
}

export function encode_Gemini(input: string): Uint32Array {
  return createMockEncoding(input);
}

export function getTokenCount_Gemini(input: string): number {
  return estimateTokensFromText(input);
}

// Main function to get token count based on model type
export function getTokenCount(input: string, model: string): number {
  switch (model) {
    case 'openai':
      return getTokenCount_OpenAI(input);
    case 'claude':
      return getTokenCount_Claude(input);
    case 'mistral':
      return getTokenCount_Mistral(input);
    case 'gemini':
      return getTokenCount_Gemini(input);
    default:
      throw new Error(`Unsupported model: ${model}`);
  }
}
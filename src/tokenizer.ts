// eslint-disable-next-line camelcase
import {get_encoding} from '@dqbd/tiktoken'
//import Anthropic from '@anthropic-ai/sdk';
import { AutoTokenizer } from '@xenova/transformers'

const tokenizer_OpenAI = get_encoding('cl100k_base')

// Anthropic client instance
/*const anthropicClient = new Anthropic({
  // Make sure to set your API key in environment variables
  apiKey: process.env.ANTHROPIC_API_KEY
});*/

// Mistral tokenizer instance (loaded asynchronously)
let tokenizer_Mistral: any = null;

// Initialize Mistral tokenizer
async function initMistralTokenizer() {
  if (!tokenizer_Mistral) {
    tokenizer_Mistral = await AutoTokenizer.from_pretrained('mistralai/Mistral-7B-Instruct-v0.1');
  }
  return tokenizer_Mistral;
}

export function encode_OpenAI(input: string): Uint32Array {
  return tokenizer_OpenAI.encode(input)
}

export function getTokenCount_OpenAI(input: string): number {
  input = input.replace(/<\|endoftext\|>/g, '')
  return encode_OpenAI(input).length
}
/*
export async function encode_Claude(input: string): Promise<number[]> {
  // Claude doesn't provide direct encoding, but we can get token count
  // This is a workaround since Claude API doesn't expose raw tokens
  try {
    const response = await anthropicClient.messages.countTokens({
      model: 'claude-sonnet-4-20250514', // or any other Claude model
      messages: [{
        role: 'user',
        content: input
      }]
    });
    
    // Since we can't get actual tokens, we return an empty array
    // The actual token count is available via getTokenCount_Claude
    return [];
  } catch (error) {
    console.error('Error encoding with Claude:', error);
    throw error;
  }
}

export async function getTokenCount_Claude(input: string): Promise<number> {
  try {
    const response = await anthropicClient.messages.countTokens({
      model: 'claude-sonnet-4-20250514', // or any other Claude model
      messages: [{
        role: 'user',
        content: input
      }]
    });
    
    return response.input_tokens;
  } catch (error) {
    console.error('Error counting tokens with Claude:', error);
    throw error;
  }
}
*/

export async function encode_Mistral(input: string): Promise<any> {
  try {
    const tokenizer = await initMistralTokenizer();
    const encoded = await tokenizer.encode(input);
    return encoded;
  } catch (error) {
    console.error('Error encoding with Mistral:', error);
    throw error;
  }
}

export async function getTokenCount_Mistral(input: string): Promise<number> {
  try {
    const encoded = await encode_Mistral(input);
    // Mistral tokenizer returns an array-like object
    return Array.isArray(encoded) ? encoded.length : encoded.data.length;
  } catch (error) {
    console.error('Error counting tokens with Mistral:', error);
    throw error;
  }
}

// The Gemini tokenizer is not available for public use, but we will estimate it with the OpenAI tokenizer
export function encode_Gemini(input: string): Uint32Array {
  // Gemini uses the same encoding as OpenAI
  return encode_OpenAI(input)
}

export function getTokenCount_Gemini(input: string): number {
  input = input.replace(/<\|endoftext\|>/g, '')
  return encode_Gemini(input).length
}

// Utility function to get token count for any model
export async function getTokenCount(input: string, model: string): Promise<number> {
  switch (model) {
    case 'openai':
      return getTokenCount_OpenAI(input);
    /*case 'claude':
      return await getTokenCount_Claude(input);*/
    case 'mistral':
      return await getTokenCount_Mistral(input);
    case 'gemini':
      return getTokenCount_Gemini(input);
    default:
      throw new Error(`Unsupported model: ${model}`);
  }
}
// eslint-disable-next-line camelcase
import {get_encoding} from '@dqbd/tiktoken'

const tokenizer_OpenAI = get_encoding('cl100k_base')

export function encode_OpenAI(input: string): Uint32Array {
  return tokenizer_OpenAI.encode(input)
}

export function getTokenCount_OpenAI(input: string): number {
  input = input.replace(/<\|endoftext\|>/g, '')
  return encode_OpenAI(input).length
}

export function encode_Claude(input: string): Uint32Array {
  // We use the OpenAI tokenizer for Claude as a temporary solution
  return encode_OpenAI(input)
}

export function getTokenCount_Claude(input: string): number {
  input = input.replace(/<\|endoftext\|>/g, '')
  return encode_Claude(input).length
}

export function encode_Mistral(input: string): Uint32Array {
  // We use the OpenAI tokenizer for Mistral as a temporary solution
  return encode_OpenAI(input)
}

export function getTokenCount_Mistral(input: string): number {
  input = input.replace(/<\|endoftext\|>/g, '')
  return encode_Mistral(input).length
}

export function encode_Gemini(input: string): Uint32Array {
  // We use the OpenAI tokenizer for Gemini as a temporary solution
  return encode_OpenAI(input)
}

export function getTokenCount_Gemini(input: string): number {
  input = input.replace(/<\|endoftext\|>/g, '')
  return encode_Gemini(input).length
}

// Fonction utilitaire pour obtenir le nombre de tokens pour n'importe quel modèle
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
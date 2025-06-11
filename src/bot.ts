import './fetch-polyfill'

import {info, setFailed, warning} from '@actions/core'
import {Options} from './options'

// import for OpenAI API
import {
  ChatGPTAPI,
  ChatGPTError,
  ChatMessage,
  SendMessageOptions
  // eslint-disable-next-line import/no-unresolved
} from 'chatgpt'
import pRetry from 'p-retry'
import {OpenAIOptions} from './options'

// import for Mistral API
import Mistral from '@mistralai/mistralai';
import {MistralOptions} from './options'

// import for Claude API
import {ClaudeOptions} from './options'

// import for Gemini API
import {GeminiOptions} from './options'

// ========== Bot Interface ==========

export interface Bot {
  /**
   * Send a single prompt to the AI and get a response
   * This is the main method used for PR analysis and test generation
   * @param prompt The complete prompt to send to the AI
   * @returns Promise<string> The AI response
   */
  sendPrompt(prompt: string): Promise<string>;
}

// Factory method to create the appropriate bot based on options
export function createBot(options: Options, modelOptions: any): Bot {
  switch (options.aiapi) {
    case 'openai':
      return new BotOpenAI(options, modelOptions as OpenAIOptions);
    case 'mistral':
      return new BotMistral(options, modelOptions as MistralOptions);
    case 'claude':
      return new BotClaude(options, modelOptions as ClaudeOptions);
    case 'gemini':
      return new BotGemini(options, modelOptions as GeminiOptions);
    default:
      throw new Error(`Unknown bot type: ${options.aiapi}`);
  }
}

// ========== OpenAI Bot ==========

export class BotOpenAI implements Bot {
  private readonly api: ChatGPTAPI | null = null
  private readonly options: Options

  constructor(options: Options, openaiOptions: OpenAIOptions) {
    this.options = options
    if (process.env.OPENAI_API_KEY) {
      const currentDate = new Date().toISOString().split('T')[0]
      const systemMessage = `${options.systemMessage}
Knowledge cutoff: 2024
Current date: ${currentDate}

IMPORTANT: Entire response must be in the language with ISO code: ${options.language}
`

      this.api = new ChatGPTAPI({
        apiBaseUrl: options.apiBaseUrl,
        systemMessage,
        apiKey: process.env.OPENAI_API_KEY,
        apiOrg: process.env.OPENAI_API_ORG ?? undefined,
        debug: options.debug,
        maxResponseTokens: openaiOptions.tokenLimits*2,
        completionParams: {
          temperature: options.aiModelTemperature,
          model: openaiOptions.model
        }
      })
    } else {
      const err = "Unable to initialize the OpenAI API, 'OPENAI_API_KEY' environment variable is not available"
      throw new Error(err)
    }
  }

  async sendPrompt(prompt: string): Promise<string> {
    const start = Date.now()
    
    if (!prompt || !this.api) {
      throw new Error('Invalid prompt or API not initialized')
    }

    try {
      const opts: SendMessageOptions = {
        timeoutMs: this.options.aiTimeoutMS
      }

      const response = await pRetry(
        () => this.api!.sendMessage(prompt, opts),
        { retries: this.options.aiRetries }
      )

      const end = Date.now()
      
      if (this.options.debug) {
        info(`OpenAI response time: ${end - start} ms`)
        info(`OpenAI response: ${response.text.substring(0, 500)}...`)
      }

      let responseText = response.text
      // Clean up response formatting
      if (responseText.startsWith('with ')) {
        responseText = responseText.substring(5)
      }

      return responseText

    } catch (e: unknown) {
      if (e instanceof ChatGPTError) {
        warning(`Failed to send prompt to OpenAI: ${e.message}`)
        throw new Error(`OpenAI API error: ${e.message}`)
      }
      throw e
    }
  }
}

// ========== Mistral Bot ==========

export class BotMistral implements Bot {
  private readonly client: Mistral | null = null
  private readonly options: Options
  private readonly mistralOptions: MistralOptions

  constructor(options: Options, mistralOptions: MistralOptions) {
    this.options = options
    this.mistralOptions = mistralOptions
    
    if (process.env.MISTRAL_API_KEY) {
      this.client = new Mistral(process.env.MISTRAL_API_KEY as string)
    } else {
      throw new Error("Unable to initialize the Mistral API, 'MISTRAL_API_KEY' environment variable is not available")
    }
  }

  async sendPrompt(prompt: string): Promise<string> {
    const start = Date.now()
    
    if (!prompt || !this.client) {
      throw new Error('Invalid prompt or API not initialized')
    }

    const systemMessage = `${this.options.systemMessage}
IMPORTANT: Entire response must be in the language with ISO code: ${this.options.language}`

    const messages = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt }
    ]

    try {
      const response = await pRetry(
        async () => {
          return await this.client!.chat({
            model: this.mistralOptions.model,
            messages: messages,
            temperature: this.options.aiModelTemperature,
            //max_tokens: this.mistralOptions.tokenLimits*2,
          })
        },
        { retries: this.options.aiRetries }
      )

      const end = Date.now()
      const responseData = response.choices[0].message
      
      if (this.options.debug) {
        info(`Mistral response time: ${end - start} ms`)
        info(`Mistral response: ${responseData.content.substring(0, 500)}...`)
      }
      
      let responseText = responseData.content
      // Clean up response formatting
      if (responseText.startsWith('with ')) {
        responseText = responseText.substring(5)
      }

      return responseText

    } catch (e) {
      warning(`Failed to send prompt to Mistral: ${(e as Error).message}`)
      throw new Error(`Mistral API error: ${(e as Error).message}`)
    }
  }
}

// ========== Claude Bot ==========

export class BotClaude implements Bot {
  private readonly options: Options
  private readonly claudeOptions: ClaudeOptions

  constructor(options: Options, claudeOptions: ClaudeOptions) {
    this.options = options
    this.claudeOptions = claudeOptions
    
    if (!process.env.CLAUDE_API_KEY) {
      throw new Error("Unable to initialize the Claude API, 'CLAUDE_API_KEY' environment variable is not available")
    }
  }

  async sendPrompt(prompt: string): Promise<string> {
    // TODO: Implement Claude API integration
    // This is a placeholder implementation
    throw new Error('Claude bot is not implemented yet. Please use OpenAI or Mistral for now.')
  }
}

// ========== Gemini Bot ==========

export class BotGemini implements Bot {
  private readonly options: Options
  private readonly geminiOptions: GeminiOptions

  constructor(options: Options, geminiOptions: GeminiOptions) {
    this.options = options
    this.geminiOptions = geminiOptions
    
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Unable to initialize the Gemini API, 'GEMINI_API_KEY' environment variable is not available")
    }
  }

  async sendPrompt(prompt: string): Promise<string> {
    // TODO: Implement Gemini API integration
    // This is a placeholder implementation
    throw new Error('Gemini bot is not implemented yet. Please use OpenAI or Mistral for now.')
  }
}
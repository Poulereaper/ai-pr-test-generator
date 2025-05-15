import '../fetch-polyfill'

import {info, setFailed, warning} from '@actions/core'
import {Options} from '../options'

// import for OpenAI API
import {
  ChatGPTAPI,
  ChatGPTError,
  ChatMessage,
  SendMessageOptions
  // eslint-disable-next-line import/no-unresolved
} from 'chatgpt'
import pRetry from 'p-retry'
import {OpenAIOptions} from '../options'

// import for Mistral API
//import {Mistral} from '@mistralai/mistralai'
import Mistral from '@mistralai/mistralai';
import {MistralOptions} from '../options'

// import for Claude API

// import for Gemini API

// ========== Messages Patterns ==========

// define type to save parentMessageId and conversationId
export interface Ids {
  parentMessageId?: string
  conversationId?: string
}

// ========== Bot Class ==========
// This class is used to store the bot and the options, it contains :
// - the bot object -> Depending on the bot type (OpenAI, Claude, Mistral, Gemini)
// - the options object
// - the bot type (OpenAI, Claude, Mistral, Gemini)

export interface Bot {
  chat(message: string, ids: Ids): Promise<[string, Ids]>;
}

// Factory method to create the appropriate bot based on options
export function createBot(options: Options, modelOptions: any): Bot {
  switch (options.aiapi) {
    case 'openai':
      return new BotOpenAI(options, modelOptions as OpenAIOptions);
    case 'mistral':
      return new BotMistral(options, modelOptions as MistralOptions);
    case 'claude':
      // To be implemented later
      throw new Error('Claude bot is not implemented yet');
    case 'gemini':
      // To be implemented later
      throw new Error('Gemini bot is not implemented yet');
    default:
      throw new Error(`Unknown bot type: ${options.aiapi}`);
  }
}

// Indications about the bots --> Need to be updated
/** 
They will need only one use case :
Our bot leave a comment under a PR that need new tests
Then the user is allowed to choose either to summarize what tests should be modified or created by highlining modifications, or generate tests for a choosen file.
The bot will then juste need to get the pre prompt, the files and dependancies based on the user choice and the files modified in the PR.
*/

// ========== OpenAI Bot ==========

export class BotOpenAI implements Bot {
  private readonly api: ChatGPTAPI | null = null // not free

  private readonly options: Options

  constructor(options: Options, openaiOptions: OpenAIOptions) {
    this.options = options
    if (process.env.OPENAI_API_KEY) {
      const currentDate = new Date().toISOString().split('T')[0]
      const systemMessage = `${options.systemMessage} 
Knowledge cutoff: ${openaiOptions.tokenLimits.knowledgeCutOff}
Current date: ${currentDate}

IMPORTANT: Entire response must be in the language with ISO code: ${options.language}
`

      this.api = new ChatGPTAPI({
        apiBaseUrl: options.apiBaseUrl,
        systemMessage,
        apiKey: process.env.OPENAI_API_KEY,
        apiOrg: process.env.OPENAI_API_ORG ?? undefined,
        debug: options.debug,
        maxModelTokens: openaiOptions.tokenLimits.maxTokens,
        maxResponseTokens: openaiOptions.tokenLimits.responseTokens,
        completionParams: {
          temperature: options.aiModelTemperature,
          model: openaiOptions.model
        }
      })
    } else {
      const err =
        "Unable to initialize the OpenAI API, both 'OPENAI_API_KEY' environment variable are not available"
      throw new Error(err)
    }
  }

  chat = async (message: string, ids: Ids): Promise<[string, Ids]> => {
    let res: [string, Ids] = ['', {}]
    try {
      res = await this.chat_(message, ids)
      return res
    } catch (e: unknown) {
      if (e instanceof ChatGPTError) {
        warning(`Failed to chat: ${e}, backtrace: ${e.stack}`)
      }
      return res
    }
  }

  private readonly chat_ = async (
    message: string,
    ids: Ids
  ): Promise<[string, Ids]> => {
    // record timing
    const start = Date.now()
    if (!message) {
      return ['', {}]
    }

    let response: ChatMessage | undefined

    if (this.api != null) {
      const opts: SendMessageOptions = {
        timeoutMs: this.options.aiTimeoutMS
      }
      if (ids.parentMessageId) {
        opts.parentMessageId = ids.parentMessageId
      }
      try {
        response = await pRetry(() => this.api!.sendMessage(message, opts), {
          retries: this.options.aiRetries
        })
      } catch (e: unknown) {
        if (e instanceof ChatGPTError) {
          info(
            `response: ${response}, failed to send message to openai: ${e}, backtrace: ${e.stack}`
          )
        }
      }
      const end = Date.now()
      info(`response: ${JSON.stringify(response)}`)
      info(
        `openai sendMessage (including retries) response time: ${
          end - start
        } ms`
      )
    } else {
      setFailed('The OpenAI API is not initialized')
    }
    let responseText = ''
    if (response != null) {
      responseText = response.text
    } else {
      warning('openai response is null')
    }
    // remove the prefix "with " in the response
    if (responseText.startsWith('with ')) {
      responseText = responseText.substring(5)
    }
    if (this.options.debug) {
      info(`openai responses: ${responseText}`)
    }
    const newIds: Ids = {
      parentMessageId: response?.id,
      conversationId: response?.conversationId
    }
    return [responseText, newIds]
  }
}

// ========== Claude Bot ==========

export class BotClaude {
  // To be implemented later
}

// ========== Mistral Bot ==========

export class BotMistral implements Bot {
  private readonly client: Mistral | null = null
  private readonly options: Options
  private readonly mistralOptions: MistralOptions
  private readonly conversationHistory: Map<string, Array<{role: string, content: string}>> = new Map()

  // For the Mistral client constructor
constructor(options: Options, mistralOptions: MistralOptions) {
  this.options = options
  this.mistralOptions = mistralOptions
  
  if (process.env.MISTRAL_API_KEY) {
    // Fix: Initialize Mistral client with apiKey parameter
    this.client = new Mistral(process.env.MISTRAL_API_KEY as string)
  } else {
    throw new Error("Unable to initialize the Mistral API, 'MISTRAL_API_KEY' environment variable is not available")
  }
}

  chat = async (message: string, ids: Ids): Promise<[string, Ids]> => {
    try {
      return await this.chat_(message, ids)
    } catch (e: unknown) {
      warning(`Failed to chat with Mistral: ${e}, backtrace: ${(e as Error).stack}`)
      return ['', {}]
    }
  }

  private readonly chat_ = async (
    message: string,
    ids: Ids
  ): Promise<[string, Ids]> => {
    const start = Date.now()
    
    if (!message) {
      return ['', {}]
    }

    if (this.client === null) {
      setFailed('The Mistral API is not initialized')
      return ['', {}]
    }

    // Create or retrieve conversation history
    const conversationId = ids.conversationId || `conv_${Date.now()}`
    if (!this.conversationHistory.has(conversationId)) {
      // Initialize with system message if it's a new conversation
      const systemMessages = [{
        role: 'system',
        content: `${this.options.systemMessage}\nIMPORTANT: Entire response must be in the language with ISO code: ${this.options.language}`
      }]
      this.conversationHistory.set(conversationId, systemMessages)
    }

    // Get current conversation
    const messages = this.conversationHistory.get(conversationId)!

    // Add user message to history
    messages.push({ role: 'user', content: message })

    try {
      const response = await pRetry(
        async () => {
          return await this.client!.chat({
            model: this.mistralOptions.model,
            messages: messages,
            temperature: this.options.aiModelTemperature,
            // Add any other parameters you need here
            //max_tokens: this.mistralOptions.tokenLimits.responseTokens,
          })
        },
        {
          retries: this.options.aiRetries
        }
      )

      const end = Date.now()
      const responseData = response.choices[0].message
      
      // Add assistant response to history
      messages.push({ 
        role: responseData.role, 
        content: responseData.content 
      })
      
      if (this.options.debug) {
        info(`Mistral response: ${JSON.stringify(response)}`)
        info(`Mistral response time: ${end - start} ms`)
      }
      
      const newIds: Ids = {
        conversationId,
        // Use the index in history as a parentMessageId equivalent
        parentMessageId: `${messages.length - 1}`
      }

      let responseText = responseData.content
      // Apply the same formatting as OpenAI bot for consistency
      if (responseText.startsWith('with ')) {
        responseText = responseText.substring(5)
      }

      return [responseText, newIds]
    } catch (e) {
      info(`Failed to send message to Mistral: ${e}, backtrace: ${(e as Error).stack}`)
      return ['', { conversationId }]
    }
  }
}

// ========== Gemini Bot ==========

export class BotGemini {
  // To be implemented later
}
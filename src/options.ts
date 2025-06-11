import {info} from '@actions/core'
import {minimatch} from 'minimatch'

export class Options {
  debug: boolean
  disabletest: boolean
  maxFiles: number
  reviewSimpleChanges: boolean
  reviewCommentLGTM: boolean
  pathFilters: PathFilter
  systemMessage: string
  aiapi: string
  aiLightModeluses: boolean
  aiLightModel: string
  aiHeavyModel: string
  aiModelTemperature: number
  aiRetries: number
  aiTimeoutMS: number
  aimaxtokens: number
  lightmaxTokens: number
  heavymaxTokens: number
  pricePerToken: number
  pricelightperToken: number
  priceheavyperToken: number
  aiConcurrencyLimit: number
  githubConcurrencyLimit: number
  apiBaseUrl: string
  diffList: string
  botName: string
  language: string

  constructor(
    debug: boolean,
    disabletest: boolean,
    maxFiles = '0',
    reviewSimpleChanges = false,
    reviewCommentLGTM = false,
    pathFilters: string[] | null = null,
    systemMessage = '',
    aiapi = 'mistral',
    aiLightModeluses = true,
    aiLightModel = 'mistral-small-latest',
    aiHeavyModel = 'mistral-large-latest',
    aiModelTemperature = '0.0',
    aiRetries = '3',
    aiTimeoutMS = '120000',
    aimaxtokens = '80000',
    lightmaxTokens = '80000',
    heavymaxTokens = '80000',
    pricePerToken = '0.000001',
    pricelightperToken = '0.000001',
    priceheavyperToken = '0.000001',
    aiConcurrencyLimit = '6',
    githubConcurrencyLimit = '6',
    apiBaseUrl = 'https://api.openai.com/v1',
    diffList = 'diff',
    botName = 'Test Generator Bot',
    language = 'en-US'
  ) {
    this.debug = debug
    this.disabletest = disabletest
    this.maxFiles = parseInt(maxFiles)
    this.reviewSimpleChanges = reviewSimpleChanges
    this.reviewCommentLGTM = reviewCommentLGTM
    this.pathFilters = new PathFilter(pathFilters)
    this.systemMessage = systemMessage
    this.aiapi = aiapi
    this.aiLightModeluses = aiLightModeluses
    this.aiLightModel = aiLightModel
    this.aiHeavyModel = aiHeavyModel
    this.aiModelTemperature = parseFloat(aiModelTemperature)
    this.aiRetries = parseInt(aiRetries)
    this.aiTimeoutMS = parseInt(aiTimeoutMS)
    this.aimaxtokens = parseInt(aimaxtokens)
    this.lightmaxTokens = parseInt(lightmaxTokens)
    this.heavymaxTokens = parseInt(heavymaxTokens)
    this.pricePerToken = parseFloat(pricePerToken)
    this.pricelightperToken = parseFloat(pricelightperToken)
    this.priceheavyperToken = parseFloat(priceheavyperToken)
    this.aiConcurrencyLimit = parseInt(aiConcurrencyLimit)
    this.githubConcurrencyLimit = parseInt(githubConcurrencyLimit)
    this.apiBaseUrl = apiBaseUrl
    this.diffList = diffList
    this.botName = botName
    this.language = language
  }

  // print all options using core.info
  print(): void {
    info(`debug: ${this.debug}`)
    info(`disable_test: ${this.disabletest}`)
    info(`max_files: ${this.maxFiles}`)
    info(`review_simple_changes: ${this.reviewSimpleChanges}`)
    info(`review_comment_lgtm: ${this.reviewCommentLGTM}`)
    info(`path_filters: ${this.pathFilters}`)
    info(`system_message: ${this.systemMessage}`)
    info(`ai_api: ${this.aiapi}`)
    info(`ai_light_model_uses: ${this.aiLightModeluses}`)
    info(`ai_light_model: ${this.aiLightModel}`)
    info(`ai_heavy_model: ${this.aiHeavyModel}`)
    info(`ai_model_temperature: ${this.aiModelTemperature}`)
    info(`ai_retries: ${this.aiRetries}`)
    info(`ai_timeout_ms: ${this.aiTimeoutMS}`)
    info(`ai_max_tokens: ${this.aimaxtokens}`)
    info(`light_max_tokens: ${this.lightmaxTokens}`)
    info(`heavy_max_tokens: ${this.heavymaxTokens}`)
    info(`price_per_token: ${this.pricePerToken}`)
    info(`price_per_token_light: ${this.pricelightperToken}`)
    info(`price_per_token_heavy: ${this.priceheavyperToken}`)
    info(`ai_concurrency_limit: ${this.aiConcurrencyLimit}`)
    info(`github_concurrency_limit: ${this.githubConcurrencyLimit}`)
    info(`ai_api_base_url: ${this.apiBaseUrl}`)
    info(`diff_list: ${this.diffList}`)
    info(`bot_name: ${this.botName}`)
    info(`language: ${this.language}`)
  }

  checkPath(path: string): boolean {
    const ok = this.pathFilters.check(path)
    info(`checking path: ${path} => ${ok}`)
    return ok
  }
}

export class PathFilter {
  private readonly rules: Array<[string /* rule */, boolean /* exclude */]>

  constructor(rules: string[] | null = null) {
    this.rules = []
    if (rules != null) {
      for (const rule of rules) {
        const trimmed = rule?.trim()
        if (trimmed) {
          if (trimmed.startsWith('!')) {
            this.rules.push([trimmed.substring(1).trim(), true])
          } else {
            this.rules.push([trimmed, false])
          }
        }
      }
    }
  }

  check(path: string): boolean {
    if (this.rules.length === 0) {
      return true
    }

    let included = false
    let excluded = false
    let inclusionRuleExists = false

    for (const [rule, exclude] of this.rules) {
      if (minimatch(path, rule)) {
        if (exclude) {
          excluded = true
        } else {
          included = true
        }
      }
      if (!exclude) {
        inclusionRuleExists = true
      }
    }

    return (!inclusionRuleExists || included) && !excluded
  }
}

export class OpenAIOptions {
  model: string
  tokenLimits: number

  constructor(model = 'gpt-3.5-turbo', tokenLimits: number | null = null) {
    this.model = model
    if (tokenLimits != null) {
      this.tokenLimits = tokenLimits
    } else {
      this.tokenLimits = 80000 // Default token limit for gpt-3.5-turbo
    }
  }
}

export class ClaudeOptions {
  model: string
  tokenLimits: number

  constructor(model = '', tokenLimits: number | null = null) {
    this.model = model
    if (tokenLimits != null) {
      this.tokenLimits = tokenLimits
    } else {
      this.tokenLimits = 100000 // Default token limit for claude 3.5 Sonnet
    }
  }
}

export class MistralOptions {
  model: string
  tokenLimits: number

  constructor(model = 'mistral-large-latest', tokenLimits: number | null = null) {
    this.model = model
    if (tokenLimits != null) {
      this.tokenLimits = tokenLimits
    } else {
      this.tokenLimits = 80000 // Default token limit for mistral-large-latest
    }
  }
}

export class GeminiOptions {
  model: string
  tokenLimits: number

  constructor(model = '', tokenLimits: number | null = null) {
    this.model = model
    if (tokenLimits != null) {
      this.tokenLimits = tokenLimits
    } else {
      this.tokenLimits = 150000 // Default token limit for gemini 2.5 Pro
    }
  }
}


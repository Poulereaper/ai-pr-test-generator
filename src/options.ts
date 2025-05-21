import {info} from '@actions/core'
import {minimatch} from 'minimatch'
import {TokenLimits} from './limits'

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
  aiConcurrencyLimit: number
  githubConcurrencyLimit: number
  lightTokenLimits: TokenLimits
  heavyTokenLimits: TokenLimits
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
    this.aiConcurrencyLimit = parseInt(aiConcurrencyLimit)
    this.githubConcurrencyLimit = parseInt(githubConcurrencyLimit)
    this.lightTokenLimits = new TokenLimits(aiLightModel)
    this.heavyTokenLimits = new TokenLimits(aiHeavyModel)
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
    info(`ai_concurrency_limit: ${this.aiConcurrencyLimit}`)
    info(`github_concurrency_limit: ${this.githubConcurrencyLimit}`)
    info(`summary_token_limits: ${this.lightTokenLimits.string()}`)
    info(`review_token_limits: ${this.heavyTokenLimits.string()}`)
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
  tokenLimits: TokenLimits

  constructor(model = 'gpt-3.5-turbo', tokenLimits: TokenLimits | null = null) {
    this.model = model
    if (tokenLimits != null) {
      this.tokenLimits = tokenLimits
    } else {
      this.tokenLimits = new TokenLimits(model)
    }
  }
}

export class ClaudeOptions {
  model: string
  tokenLimits: TokenLimits

  constructor(model = 'claude-3', tokenLimits: TokenLimits | null = null) {
    this.model = model
    if (tokenLimits != null) {
      this.tokenLimits = tokenLimits
    } else {
      this.tokenLimits = new TokenLimits(model)
    }
  }
}

export class MistralOptions {
  model: string
  tokenLimits: TokenLimits

  constructor(model = 'mistral-large-latest', tokenLimits: TokenLimits | null = null) {
    this.model = model
    if (tokenLimits != null) {
      this.tokenLimits = tokenLimits
    } else {
      this.tokenLimits = new TokenLimits(model)
    }
  }
}

export class GeminiOptions {
  model: string
  tokenLimits: TokenLimits

  constructor(model = 'gemini-1.5', tokenLimits: TokenLimits | null = null) {
    this.model = model
    if (tokenLimits != null) {
      this.tokenLimits = tokenLimits
    } else {
      this.tokenLimits = new TokenLimits(model)
    }
  }
}


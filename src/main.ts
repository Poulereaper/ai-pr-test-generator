import {
  getBooleanInput,
  getInput,
  getMultilineInput,
  setFailed,
  warning,
  info
} from '@actions/core'

import {Bot, createBot} from './bot'
import {OpenAIOptions, Options} from './options'
import {ClaudeOptions} from './options'
import {MistralOptions} from './options'
import {GeminiOptions} from './options'
import {Prompts} from './prompts'
import {FilesInfo, FileData} from './related-files-finder'
import {handlePRAnalysis} from './pr-commenter'
import { TreeGenerator } from './project-tree-analyer'

// ======= Options ========

info('\n    o_o Hello... \n\nStarting Tests Generator Bot Action...')
info('If you need any detail about this action, set the debug input to true to see more information in the logs.\n\n')

// Check if the required inputs are provided
async function run(): Promise<void> {
  const options: Options = new Options(
    getBooleanInput('debug'),
    getBooleanInput('disable_test'),
    getInput('max_files'),
    getBooleanInput('review_simple_changes'),
    getBooleanInput('review_comment_lgtm'),
    getMultilineInput('path_filters'),
    getInput('system_message'),
    getInput('ai_api'),
    getBooleanInput('ai_light_model_uses'),
    getInput('ai_light_model'),
    getInput('ai_heavy_model'),
    getInput('ai_model_temperature'),
    getInput('ai_retries'),
    getInput('ai_timeout_ms'),
    getInput('ai_max_tokens'),
    getInput('ai_max_tokens_light'),
    getInput('ai_max_tokens_heavy'),
    getInput('price_per_token'),
    getInput('price_per_token_out'),
    getInput('price_per_token_light'),
    getInput('price_per_token_light_out'),
    getInput('price_per_token_heavy'),
    getInput('price_per_token_heavy_out'),
    getInput('ai_concurrency_limit'),
    getBooleanInput('ai_or_no'), // Debugging flag to indicate if AI is enabled or not (use it for debbug to avoid paying for AI calls)
    getInput('github_concurrency_limit'),
    getInput('ai_api_base_url'),
    getInput('project_context'),
    getInput('your_test_gen_bot_name'),
    getInput('language')
  )

  if(options.debug){
    info(`\n\n----------------------------\n\nDebugging Info - Options\n\n----------------------------\n\n`)
    options.print()
  }

  // ========= Prompts =========

  const prompts: Prompts = new Prompts()
  
  // ======== Bot Creation ========

  if (options.debug) {
    info(`\n\n----------------------------\n\nDebugging Info - Bot Creation\n\n----------------------------\n\n`)
    info ('The Bot is basiclly the AI model that will be used to generate the tests and comments for the PR.\n')
    info (`Creating bot with the following options:`)
    info (`AI API: ${options.aiapi}`)
    info (`AI Light Model Uses: ${options.aiLightModeluses}`)
    if (options.aiLightModeluses) {
      info (`AI Light Model: ${options.aiLightModel}`)
      info (`AI Heavy Model: ${options.aiHeavyModel}`)
      info (`AI Model Temperature: ${options.aiModelTemperature}`)
      info (`AI Retries: ${options.aiRetries}`)
      info (`AI Timeout (ms): ${options.aiTimeoutMS}`)
      info ('AI light Model Max Tokens: ' + options.lightmaxTokens)
      info ('AI heavy Model Max Tokens: ' + options.heavymaxTokens)

    }else {
      info ('AI Model (heavy only): ' + options.aiHeavyModel)
      info (`AI Model Temperature: ${options.aiModelTemperature}`)
      info (`AI Retries: ${options.aiRetries}`)
      info (`AI Timeout (ms): ${options.aiTimeoutMS}`)
      info ('AI light Model Max Tokens: ' + options.heavymaxTokens)
    }
  }

  let lightBot: Bot | null = null
  let heavyBot: Bot | null = null

  // If light model is enabled, we need both light and heavy models
  if (options.aiLightModeluses) {
    if (options.aiLightModel === '') {
      setFailed('ai_light_model is required when ai_light_model_uses is true')
      return
    }
    if (options.aiHeavyModel === '') {
      setFailed('ai_heavy_model is required when ai_light_model_uses is true')
      return
    }
    if (options.aiLightModel === options.aiHeavyModel) {
      setFailed('ai_light_model and ai_heavy_model cannot be the same')
      return
    }

    // Check for required API base URL
    if (options.apiBaseUrl === '' && options.aiapi !== 'mistral') {
      setFailed(`${options.aiapi} base url is required`)
      return
    }

    // Create light model bot
    try {
      let lightModelOptions;
      switch (options.aiapi) {
        case 'openai':
          lightModelOptions = new OpenAIOptions(options.aiLightModel, options.lightmaxTokens);
          break;
        case 'mistral':
          lightModelOptions = new MistralOptions(options.aiLightModel, options.lightmaxTokens);
          break;
        case 'claude':
          lightModelOptions = new ClaudeOptions(options.aiLightModel, options.lightmaxTokens);
          break;
        case 'gemini':
          lightModelOptions = new GeminiOptions(options.aiLightModel, options.lightmaxTokens);
          break;
      }
      
      lightBot = createBot(options, lightModelOptions);
      if (options.debug && lightBot) {
        info(`Light model bot created successfully with model: ${options.aiLightModel}`);
      }
    } catch (e: any) {
      warning(
        `Skipped: failed to create bot, please check your ${options.aiapi} API key: ${e}, backtrace: ${e.stack}`
      )
      return
    }

    // Create heavy model bot
    try {
      let heavyModelOptions;
      switch (options.aiapi) {
        case 'openai':
          heavyModelOptions = new OpenAIOptions(options.aiHeavyModel, options.heavymaxTokens);
          break;
        case 'mistral':
          heavyModelOptions = new MistralOptions(options.aiHeavyModel, options.heavymaxTokens);
          break;
        case 'claude':
          heavyModelOptions = new ClaudeOptions(options.aiHeavyModel, options.heavymaxTokens);
          break;
        case 'gemini':
          heavyModelOptions = new GeminiOptions(options.aiHeavyModel, options.heavymaxTokens);
          break;
      }
      
      heavyBot = createBot(options, heavyModelOptions);
      if (options.debug && heavyBot) {
        info(`Heavy model bot created successfully with model: ${options.aiHeavyModel}`);
      }
    } catch (e: any) {
      warning(
        `Skipped: failed to create review bot, please check your ${options.aiapi} API key: ${e}, backtrace: ${e.stack}`
      )
      return
    }
  } else {
    // If light model is not enabled, we only need the heavy model
    if (options.aiHeavyModel === '') {
      setFailed('ai_heavy_model is required')
      return
    }
    // Check for required API base URL
    if (options.apiBaseUrl === '' && options.aiapi !== 'mistral') {
      setFailed(`${options.aiapi} base url is required`)
      return
    }
    // Create heavy model bot only
    try {
      let modelOptions;
      switch (options.aiapi) {
        case 'openai':
          modelOptions = new OpenAIOptions(options.aiHeavyModel, options.aimaxtokens);
          break;
        case 'mistral':
          modelOptions = new MistralOptions(options.aiHeavyModel, options.aimaxtokens);
          break;
        case 'claude':
          modelOptions = new ClaudeOptions(options.aiHeavyModel, options.aimaxtokens);
          break;
        case 'gemini':
          modelOptions = new GeminiOptions(options.aiHeavyModel, options.aimaxtokens);
          break;
      }
      
      heavyBot = createBot(options, modelOptions);
      if (options.debug && lightBot) {
        info(`Light model bot created successfully with model: ${options.aiLightModel}`);
      }
    } catch (e: any) {
      warning(
        `Skipped: failed to create bot, please check your ${options.aiapi} API key: ${e}, backtrace: ${e.stack}`
      )
      return
    }
  }
  info (`${options.botName} Bot created successfully !`)


  // ========== Project's Tree Generation ==========

  if (options.debug) {
    info(`\n\n----------------------------\n\nDebugging Info - Projects Tree\n\n----------------------------\n\n`)
  }

  // Passez le flag debug au constructeur
  const treeGenerator = new TreeGenerator(options.pathFilters, false)

  try {
    if (options.debug) {
      info('Starting project tree generation...\n')
      // display diagnostic info if debug is enabled
      //info('Diagnostic Info:')
      //info(treeGenerator.getDiagnosticInfo())
      //info('----------------------------')
    }
    
    // Test avec l'arborescence complète d'abord
    const fullTree = treeGenerator.generateTree()
    const simpleTree = treeGenerator.generateSimpleTree()
    
    if (options.debug) {
      info('-> Full Tree Output (50 first lines):')
      info(
        fullTree
          .split('\n')
          .slice(0, 50)
          .join('\n') + '...' || '(empty)'
      )
      info('--------------')
      info('\n-> Simple Tree Output (50 first lines):')
      info(
        simpleTree
          .split('\n')
          .slice(0, 50)
          .join('\n') + '...' || '(empty)'
      )
      info('--------------\n')
    }
    
    // Use simple tree for lighter prompts
    prompts.project_struct = simpleTree
    
    if (!prompts.project_struct || prompts.project_struct.trim() === '') {
      warning('Project tree generation returned an empty structure.')
      warning('This might be due to:')
      warning('- Repository is empty')
      warning('- Path filters are too restrictive')
      warning('- Permission issues')
      warning('- Incorrect workspace path')
    } else {
      info(`Project tree generated successfully (${prompts.project_struct.length} characters).`)
    }
    
  } catch (e: any) {
    Error(`Project tree generation failed: ${e.message}`)
    if (options.debug) {
      Error(`Stack trace: ${e.stack}`)
    }
  }

  // ========== Files Analysis =======
  // Before analysing the PR we need to check the files changed in the PR and find all their related files and related tests

  let filesInfo: FilesInfo | null = null
  let filesDependencies: Map<string, FileData> = new Map()
  let testsToModify: string[] = []

  try {
    if (options.debug) {
      info(`\n\n----------------------------\n\nDebugging Info - Diff and Related Files\n\n----------------------------\n\n`)
      info('Starting files analysis to find related files and tests...\n')
    }
    
    // Initialize the FilesInfo class
    filesInfo = new FilesInfo(options)
    
    // Process all modified files
    await filesInfo.processModifiedFiles()

    // Get the dependencies and test files
    filesDependencies = filesInfo.getAllFiles()
    testsToModify = filesInfo.getTestsToModify()

    if (options.debug) {
      info(`Found ${filesDependencies.size} related files`)
      info(`Found ${testsToModify.length} test files that may need to be updated`)
      
      // Log detailed information about each file
      for (const [filePath, fileData] of filesDependencies) {
        info(`File: ${filePath}`)
        info(`  Dependencies: ${fileData.dependencies.map(d => d.path).join(', ')}`)
        info(`  Dependents: ${fileData.dependents.map(d => d.path).join(', ')}`)
        info(`  Test Files: ${fileData.testFiles.join(', ')}`)
      }
    }
  } catch (e: any) {
    warning(`Files analysis failed: ${e.message}, backtrace: ${e.stack}`)
    // Stop the action if files analysis fails
    setFailed(`Files analysis failed: ${e.message}, backtrace: ${e.stack}`)
    return
  }

  // ======== PR Analysis ========
  // Handle PR Analysis using the external module
  await handlePRAnalysis(
    options,
    filesInfo,
    filesDependencies,
    testsToModify,
    lightBot,
    heavyBot,
    prompts
  )
}

process
  .on('unhandledRejection', (reason, p) => {
    warning(`Unhandled Rejection at Promise: ${reason}, promise is ${p}`)
  })
  .on('uncaughtException', (e: any) => {
    warning(`Uncaught Exception thrown: ${e}, backtrace: ${e.stack}`)
  })

await run()
import {
  getBooleanInput,
  getInput,
  getMultilineInput,
  setFailed,
  warning,
  info
} from '@actions/core'
import * as github from '@actions/github'
import {context as github_context} from '@actions/github'

import {Bot, createBot} from './bot'
import {OpenAIOptions, Options} from './options'
import {ClaudeOptions} from './options'
import {MistralOptions} from './options'
import {GeminiOptions} from './options'
//import {Prompts} from './use_in_future/prompts'
import {FilesInfo, FileData} from './related-files-finder'
import {octokit} from './octokit'

//import {codeReview} from './review'
//import {handleReviewComment} from './review-comment'


// ======= Utility Functions for Command Parsing =======

interface UserCommand {
  action: 'generate tests' | 'explain tests' | 'sec check'
  filename: string
}

interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Parse user command from comment body
 * Expected formats:
 * - "generate tests <filename>"
 * - "explain tests <filename>"
 * - "sec check <filename>"
 */
function parseUserCommand(commentBody: string): UserCommand | null {
  const normalizedComment = commentBody.toLowerCase().trim()
  
  // Regular expressions for each command type
  const generateTestsRegex = /generate\s+tests\s+(.+)/
  const explainTestsRegex = /explain\s+tests\s+(.+)/
  const secCheckRegex = /sec\s+check\s+(.+)/
  
  let match: RegExpMatchArray | null = null
  let action: UserCommand['action'] | null = null
  
  if ((match = normalizedComment.match(generateTestsRegex))) {
    action = 'generate tests'
  } else if ((match = normalizedComment.match(explainTestsRegex))) {
    action = 'explain tests'
  } else if ((match = normalizedComment.match(secCheckRegex))) {
    action = 'sec check'
  }
  
  if (match && action) {
    const filename = match[1].trim()
    // Remove potential backticks if user wrapped filename in code blocks
    const cleanFilename = filename.replace(/`/g, '')
    
    if (cleanFilename) {
      return {
        action,
        filename: cleanFilename
      }
    }
  }
  
  return null
}

/**
 * Validate that the requested file exists in our analysis
 */
function validateRequestedFile(
  filename: string, 
  filesInfo: FilesInfo | null, 
  filesDependencies: Map<string, FileData>
): ValidationResult {
  if (!filesInfo) {
    return {
      valid: false,
      error: 'Files analysis not available'
    }
  }
  
  // Check if file exists in our dependencies map
  if (filesDependencies.has(filename)) {
    return { valid: true }
  }
  
  // Check if it's one of the modified files
  const modifiedFiles = filesInfo.getModifiedFilesData()
  const fileExists = modifiedFiles.some(file => file.path === filename)
  
  if (fileExists) {
    return { valid: true }
  }
  
  // Check if it's one of the test files that need modification
  const testsToModify = filesInfo.getTestsToModify()
  if (testsToModify.includes(filename)) {
    return { valid: true }
  }
  
  return {
    valid: false,
    error: `File "${filename}" was not found in the analysis. Please make sure the filename is correct and that it's part of this PR.`
  }
}

/**
 * Generate a helpful message listing available files
 */
function getAvailableFilesMessage(
  filesInfo: FilesInfo | null, 
  filesDependencies: Map<string, FileData>
): string {
  if (!filesInfo) {
    return 'No files available for analysis.'
  }
  
  let message = '**Available files for analysis:**\n\n'
  
  // Add modified files
  const modifiedFiles = filesInfo.getModifiedFilesData()
  if (modifiedFiles.length > 0) {
    message += '📝 **Modified files:**\n'
    modifiedFiles.forEach(file => {
      message += `- \`${file.path}\`\n`
    })
    message += '\n'
  }
  
  // Add test files that might need updates
  const testsToModify = filesInfo.getTestsToModify()
  if (testsToModify.length > 0) {
    message += '🧪 **Test files that might need updates:**\n'
    testsToModify.forEach(testPath => {
      message += `- \`${testPath}\`\n`
    })
    message += '\n'
  }
  
  // Add related files if they exist
  const relatedFiles = Array.from(filesDependencies.keys()).filter(
    path => !modifiedFiles.some(f => f.path === path) && !testsToModify.includes(path)
  )
  if (relatedFiles.length > 0) {
    message += '🔗 **Related files:**\n'
    relatedFiles.slice(0, 10).forEach(path => { // Limit to first 10 to avoid too long messages
      message += `- \`${path}\`\n`
    })
    if (relatedFiles.length > 10) {
      message += `... and ${relatedFiles.length - 10} more files\n`
    }
  }
  
  return message
}








  // ======= Options ========

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
    getInput('ai_concurrency_limit'),
    getInput('github_concurrency_limit'),
    getInput('ai_api_base_url'),
    getInput('diff_file'),
    getInput('your_test_gen_bot_name'),
    getInput('language')
  )

  options.print()

  // ========= Prompts =========

  /**const prompts: Prompts = new Prompts(
    getInput('summarize'),
    getInput('summarize_release_notes')
  )**/
  
  // ======= Bot Creation =======

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
          lightModelOptions = new OpenAIOptions(options.aiLightModel, options.lightTokenLimits);
          break;
        case 'mistral':
          lightModelOptions = new MistralOptions(options.aiLightModel, options.lightTokenLimits);
          break;
        case 'claude':
          lightModelOptions = new ClaudeOptions(options.aiLightModel, options.lightTokenLimits);
          break;
        case 'gemini':
          lightModelOptions = new GeminiOptions(options.aiLightModel, options.lightTokenLimits);
          break;
      }
      
      lightBot = createBot(options, lightModelOptions);
    } catch (e: any) {
      warning(
        `Skipped: failed to create summary bot, please check your ${options.aiapi} API key: ${e}, backtrace: ${e.stack}`
      )
      return
    }

    // Create heavy model bot
    try {
      let heavyModelOptions;
      switch (options.aiapi) {
        case 'openai':
          heavyModelOptions = new OpenAIOptions(options.aiHeavyModel, options.heavyTokenLimits);
          break;
        case 'mistral':
          heavyModelOptions = new MistralOptions(options.aiHeavyModel, options.heavyTokenLimits);
          break;
        case 'claude':
          heavyModelOptions = new ClaudeOptions(options.aiHeavyModel, options.heavyTokenLimits);
          break;
        case 'gemini':
          heavyModelOptions = new GeminiOptions(options.aiHeavyModel, options.heavyTokenLimits);
          break;
      }
      
      heavyBot = createBot(options, heavyModelOptions);
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
          modelOptions = new OpenAIOptions(options.aiHeavyModel, options.heavyTokenLimits);
          break;
        case 'mistral':
          modelOptions = new MistralOptions(options.aiHeavyModel, options.heavyTokenLimits);
          break;
        case 'claude':
          modelOptions = new ClaudeOptions(options.aiHeavyModel, options.heavyTokenLimits);
          break;
        case 'gemini':
          modelOptions = new GeminiOptions(options.aiHeavyModel, options.heavyTokenLimits);
          break;
      }
      
      heavyBot = createBot(options, modelOptions);
    } catch (e: any) {
      warning(
        `Skipped: failed to create bot, please check your ${options.aiapi} API key: ${e}, backtrace: ${e.stack}`
      )
      return
    }
  }

info (`${options.botName} bot created successfully`)

// ========== Files Analysis =======
// Before analysing the PR we need to check the files changed in the PR and find all their related files and related tests

let filesInfo: FilesInfo | null = null
let filesDependencies: Map<string, FileData> = new Map()
let testsToModify: string[] = []

try {
  if (options.debug) {
    info('Starting files analysis to find related files and tests...')
  }
  
  // Initialize the FilesInfo class
  filesInfo = new FilesInfo(options)
  
  // Process all modified files
  const diffList = options.diffList.split('\n').map(filename => ({ filename }));
  await filesInfo.processModifiedFiles(diffList);
  
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
// This is a test version, we will use differetns files in the future

try {
  // check if the event is pull_request
  if (
    process.env.GITHUB_EVENT_NAME === 'pull_request' ||
    process.env.GITHUB_EVENT_NAME === 'pull_request_target'
  ) {
      //For the moment we will only leave a comment with files that need tests and respond to the comment with "Okay" if the user asks for it
      if (options.debug) {
        info('Processing pull request event')
      }
      
      // Vérification que le token est disponible (déjà gérée dans octokit.ts)
      if (!process.env.GITHUB_TOKEN && !getInput('token')) {
        setFailed('GITHUB_TOKEN is required for commenting on PRs')
        return
      }
      
      // Check if we have test files that need to be updated
      if (testsToModify.length > 0 || filesInfo?.getModifiedFilesData().some(file => !file.isTest && file.testFiles.length === 0)) {
        // Prepare the comment
        let commentBody = `## AI Test Generator Bot Report\n\n`
        commentBody += `I've analyzed this PR and found some files that might need test updates:\n\n`
        
        // Add files with missing tests
        const filesWithoutTests = filesInfo?.getModifiedFilesData().filter(file => !file.isTest && file.testFiles.length === 0) || []
        if (filesWithoutTests.length > 0) {
          commentBody += `### Files without tests:\n`
          filesWithoutTests.forEach(file => {
            commentBody += `- \`${file.path}\`\n`
          })
          commentBody += `\n`
        }
        
        // Add tests that might need updates
        if (testsToModify.length > 0) {
          commentBody += `### Tests that might need updates:\n`
          testsToModify.forEach(testPath => {
            commentBody += `- \`${testPath}\`\n`
          })
          commentBody += `\n`
        }
        
        // Add instructions for the user
        commentBody += `### How to use:\n`
        commentBody += `Reply to this comment with one of these commands:\n`
        commentBody += `- \`generate tests <filename>\` - Generate test implementations for a specific file\n`
        commentBody += `- \`explain tests <filename>\` - Explain what tests should be implemented for a specific file\n`
        commentBody += `- \`sec check <filename>\` - Check for potential security vulnerabilities in a specific file\n\n`
        commentBody += `**Example:** \`generate tests src/utils/helper.ts\`\n`
        
        // Post the comment using your octokit module
        await octokit.rest.issues.createComment({
          owner: github_context.repo.owner,
          repo: github_context.repo.repo,
          issue_number: github_context.issue.number,
          body: commentBody
        })
        
        if (options.debug) {
          info('Posted comment about files needing tests')
        }
      } else {
        info('No files needing tests were detected. Skipping comment.')
      }

  } else if (
    process.env.GITHUB_EVENT_NAME === 'pull_request_review_comment' ||
    process.env.GITHUB_EVENT_NAME === 'issue_comment'
  ) {
    // Respond to the comment with "Okay" if the user asks for tests
    if (options.debug) {
      info('Processing comment event')
    }
    
    // Get the comment information from context
    const payload = github_context.payload
    const comment = payload.comment
    
    if (!comment) {
      warning('No comment found in payload')
      return
    }
    
    // Parse user command from comment
    const userCommand = parseUserCommand(comment.body)
    
    if (userCommand) {
      // Vérification que le token est disponible (déjà gérée dans octokit.ts)
      if (!process.env.GITHUB_TOKEN && !getInput('token')) {
        setFailed('GITHUB_TOKEN is required for commenting on PRs')
        return
      }
      
      // Validate that the requested file exists in our analysis
      const isValidFile = validateRequestedFile(userCommand.filename, filesInfo, filesDependencies)
      
      if (!isValidFile.valid) {
        await octokit.rest.issues.createComment({
          owner: github_context.repo.owner,
          repo: github_context.repo.repo,
          issue_number: github_context.issue.number,
          body: `❌ **Error**: ${isValidFile.error}\n\n${getAvailableFilesMessage(filesInfo, filesDependencies)}`
        })
        return
      }
      
      // Prepare response based on user choice
      let responseBody = `✅ **Command received**: \`${userCommand.action} ${userCommand.filename}\`\n\n`
      
      switch (userCommand.action) {
        case 'generate tests':
          responseBody += `🔧 **Action**: Generating test implementations\n`
          responseBody += `📁 **Target file**: \`${userCommand.filename}\`\n\n`
          responseBody += `I will now generate comprehensive test implementations for this file.\n`
          // TODO: Call AI function with: generateTests(userCommand.filename, fileContent, relatedFiles)
          break
          
        case 'explain tests':
          responseBody += `📋 **Action**: Explaining test requirements\n`
          responseBody += `📁 **Target file**: \`${userCommand.filename}\`\n\n`
          responseBody += `I will analyze the file and explain what tests should be implemented.\n`
          // TODO: Call AI function with: explainTests(userCommand.filename, fileContent, relatedFiles)
          break
          
        case 'sec check':
          responseBody += `🔒 **Action**: Security vulnerability analysis\n`
          responseBody += `📁 **Target file**: \`${userCommand.filename}\`\n\n`
          responseBody += `I will analyze the file for potential security vulnerabilities.\n`
          // TODO: Call AI function with: securityCheck(userCommand.filename, fileContent, relatedFiles)
          break
      }
      
      responseBody += `\n*(This is a placeholder - AI functionality will be implemented next)*`
      
      // Reply using your octokit module
      await octokit.rest.issues.createComment({
        owner: github_context.repo.owner,
        repo: github_context.repo.repo,
        issue_number: github_context.issue.number,
        body: responseBody
      })
      
      if (options.debug) {
        info(`Processed user command: ${userCommand.action} for file: ${userCommand.filename}`)
      }
    } else {
      if (options.debug) {
        info('Comment does not contain a valid command, ignoring')
      }
    }
  } else {
    warning('Skipped: this action only works on push events or pull_request')
  }
} catch (e: any) {
  if (e instanceof Error) {
    setFailed(`Failed to run: ${e.message}, backtrace: ${e.stack}`)
  } else {
    setFailed(`Failed to run: ${e}, backtrace: ${e.stack}`)
  }
}
}

process
  .on('unhandledRejection', (reason, p) => {
    warning(`Unhandled Rejection at Promise: ${reason}, promise is ${p}`)
  })
  .on('uncaughtException', (e: any) => {
    warning(`Uncaught Exception thrown: ${e}, backtrace: ${e.stack}`)
  })

await run()

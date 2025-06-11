// We will Put the PR Analysis in this file
import {
  getInput,
  setFailed,
  warning,
  info
} from '@actions/core'
import * as github from '@actions/github'
import {context as github_context} from '@actions/github'

import {Bot} from './bot'
import {Options} from './options'
import {Prompts} from './prompts'
import {FilesInfo, FileData} from './related-files-finder'
import {octokit} from './octokit'
import {PromptBuilder, PromptContext} from './prompt-builder'
import {getTokenCount}from './tokenizer'
//import { ProjectTreeAnalyzer } from './project-tree-analyer'

// ======= Utility Functions for Command Parsing =======

interface UserCommand {
  action: 'summarize tests' | 'generate tests' | 'all generate tests' | 'explain tests' | 'all explain tests' | 'sec check' | 'custom prompt' | 'all custom prompt'
  filename?: string
  customPrompt?: string
}

interface ValidationResult {
  valid: boolean
  error?: string
}

// Parses the user command from the comment body
function parseUserCommand(commentBody: string): UserCommand | null {
  const trimmedComment = commentBody.trim()
  const lowerComment = trimmedComment.toLowerCase()
  
  // Regex patterns pour chaque type de commande
  const patterns = {
    summarizeTests: /^summarize\s+tests(?:\s+(.+?))?(?:\s+--prompt\s+(.+))?$/i,
    allGenerateTests: /^all\s+generate\s+tests(?:\s+--prompt\s+(.+))?$/i,
    generateTests: /^generate\s+tests\s+(.+?)(?:\s+--prompt\s+(.+))?$/i,
    allExplainTests: /^all\s+explain\s+tests(?:\s+--prompt\s+(.+))?$/i,
    explainTests: /^explain\s+tests\s+(.+?)(?:\s+--prompt\s+(.+))?$/i,
    secCheck: /^sec\s+check\s+(.+?)(?:\s+--prompt\s+(.+))?$/i,
    allCustomPrompt: /^all\s+custom\s+prompt\s+--prompt\s+(.+)$/i,
    customPrompt: /^custom\s+prompt\s+(.+?)\s+--prompt\s+(.+)$/i
  }
  
  let match: RegExpMatchArray | null = null
  
  // Test des patterns dans l'ordre de spécificité (plus spécifique en premier)
  if ((match = trimmedComment.match(patterns.summarizeTests))) {
    return {
      action: 'summarize tests',
      filename: match[1]?.trim().replace(/`/g, ''),
      customPrompt: match[2]?.trim()
    }
  }
  
  if ((match = trimmedComment.match(patterns.allGenerateTests))) {
    return {
      action: 'all generate tests',
      customPrompt: match[1]?.trim()
    }
  }
  
  if ((match = trimmedComment.match(patterns.generateTests))) {
    const filename = match[1]?.trim().replace(/`/g, '')
    if (filename) {
      return {
        action: 'generate tests',
        filename,
        customPrompt: match[2]?.trim()
      }
    }
  }
  
  if ((match = trimmedComment.match(patterns.allExplainTests))) {
    return {
      action: 'all explain tests',
      customPrompt: match[1]?.trim()
    }
  }
  
  if ((match = trimmedComment.match(patterns.explainTests))) {
    const filename = match[1]?.trim().replace(/`/g, '')
    if (filename) {
      return {
        action: 'explain tests',
        filename,
        customPrompt: match[2]?.trim()
      }
    }
  }
  
  if ((match = trimmedComment.match(patterns.secCheck))) {
    const filename = match[1]?.trim().replace(/`/g, '')
    if (filename) {
      return {
        action: 'sec check',
        filename,
        customPrompt: match[2]?.trim()
      }
    }
  }
  
  if ((match = trimmedComment.match(patterns.allCustomPrompt))) {
    return {
      action: 'all custom prompt',
      customPrompt: match[1]?.trim()
    }
  }
  
  if ((match = trimmedComment.match(patterns.customPrompt))) {
    const filename = match[1]?.trim().replace(/`/g, '')
    const customPrompt = match[2]?.trim()
    if (filename && customPrompt) {
      return {
        action: 'custom prompt',
        filename,
        customPrompt
      }
    }
  }
  
  return null
}

/**
 * Validate that the requested file exists in our analysis
 */
function validateRequestedFile(
  filename: string | undefined, 
  filesInfo: FilesInfo | null, 
  filesDependencies: Map<string, FileData>
): ValidationResult {
  // Si pas de filename (commandes "all"), c'est valide
  if (!filename) {
    return { valid: true }
  }
  
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

/**
 * Handle pull request events - post initial comment about files needing tests
 */
async function handlePullRequestEvent(
  options: Options,
  filesInfo: FilesInfo | null,
  filesDependencies: Map<string, FileData>,
  testsToModify: string[]
): Promise<void> {
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
    commentBody += `Reply to this comment with one of these commands:\n\n`
    commentBody += `**Single file commands:**\n`
    commentBody += `- \`summarize tests <filename>\` - Summarize file diff for test generation\n`
    commentBody += `- \`generate tests <filename>\` - Generate test implementations for a specific file\n`
    commentBody += `- \`explain tests <filename>\` - Explain what tests should be implemented for a specific file\n`
    commentBody += `- \`sec check <filename>\` - Check for potential security vulnerabilities in a specific file\n`
    commentBody += `- \`custom prompt <filename> --prompt <your_instructions>\` - Custom analysis for a specific file\n\n`
    commentBody += `**All files commands:**\n`
    commentBody += `- \`all generate tests\` - Generate tests for all modified files\n`
    commentBody += `- \`all explain tests\` - Explain tests needed for all modified files\n`
    commentBody += `- \`all custom prompt --prompt <your_instructions>\` - Custom analysis for all files\n\n`
    commentBody += `**Adding custom instructions:**\n`
    commentBody += `You can add \`--prompt <your_instructions>\` to any command for custom behavior.\n\n`
    commentBody += `**Examples:**\n`
    commentBody += `- \`generate tests src/utils/helper.ts\`\n`
    commentBody += `- \`generate tests src/api/auth.ts --prompt Focus on error handling and edge cases\`\n`
    commentBody += `- \`all generate tests --prompt Use Jest and include integration tests\`\n`
    commentBody += `- \`all custom prompt --prompt Generate performance tests for all files\`\n`
    
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
}

/**
 * Handle comment events - respond to user commands
 */
async function handleCommentEvent(
  options: Options,
  filesInfo: FilesInfo | null,
  filesDependencies: Map<string, FileData>,
  lightBot: Bot | null,
  heavyBot: Bot | null,
  prompts: Prompts
): Promise<void> {
  if (options.debug) {
    info('Processing comment event')
  }
  
  // Get the comment information from context
  const payload = github_context.payload
  const comment = payload.comment
  //const analyzer = new ProjectTreeAnalyzer([options.pathFilters]);
  
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

    try {
      // create a prompt builder instance
      const promptBuilder = new PromptBuilder(prompts)
      
      // Context for the prompt
      const promptContext: PromptContext = {
        filename: userCommand.filename,
        customPrompt: userCommand.customPrompt,
        filesInfo,
        filesDependencies,
        ProjectStruct: 'No project structure available for the moment sry'
        
      }
      
      // Generate the prompt context and target files
      const promptResult = await promptBuilder.buildPrompt(userCommand.action, promptContext)
      
      if (options.debug) {
        info(`\n\n----------------------------\n\nDebugging Info - Prompt Generation\n\n----------------------------\n`)
        info(`Generated prompt context: ${promptResult.context}`)
        info(`Target files: ${promptResult.targetFiles.join(', ')}`)
        info(`Prompt preview: ${promptResult.prompt.substring(0, 4000)}...`)
      }
      
      // Prepare initial response body -> Comment this part after to avoid spamming the user, or in debug mode only ?
      let responseBody = `✅ **Command received**: \`${userCommand.action} ${userCommand.filename || ''}\`\n\n`
      responseBody += `📋 **Context**: ${promptResult.context}\n`
      responseBody += `📁 **Target files**: ${promptResult.targetFiles.map(f => `\`${f}\``).join(', ')}\n`
      
      if (userCommand.customPrompt) {
        responseBody += `💭 **Custom instructions**: ${userCommand.customPrompt}\n`
      }
      
      responseBody += `\n🤖 **Processing...** Please wait while I analyze the code and generate the response.\n`
      
      // Post initial answer to acknowledge the command
      await octokit.rest.issues.createComment({
        owner: github_context.repo.owner,
        repo: github_context.repo.repo,
        issue_number: github_context.issue.number,
        body: responseBody
      })
      // Tokenize the prompt to avoid exceeding limits
      //getTokenCount(promptResult.prompt, options.aiapi)
      const TokenPrompt = await getTokenCount(promptResult.prompt, options.aiapi)

      if (options.debug) {
        info(`\n\n----------------------------\n\nDebugging Info - Token Count\n\n----------------------------\n`)
        info(`Token count for prompt: ${TokenPrompt}`)
      }

      // Determine which bot to use based on the action based on the token count

      if(!options.aiLightModeluses && TokenPrompt > options.aimaxtokens) {

        //Bot response to informe the user via comment

        const errorMessage = `❌ **Error**: The generated prompt exceeds the maximum token limit of ${options.aimaxtokens} tokens.\n\n`
        + `Please try simplifying your request or reducing the number of target files.\n\n`
        + `**Command**: \`${userCommand.action} ${userCommand.filename || ''}\`\n`
        + `**Token count**: ${TokenPrompt}\n`
        + `**Max tokens allowed**: ${options.aimaxtokens}\n\n`
        + `You can also try using a custom prompt with fewer files or simpler instructions.`
        + `Or use another model.`
        await octokit.rest.issues.createComment({
          owner: github_context.repo.owner,
          repo: github_context.repo.repo,
          issue_number: github_context.issue.number,
          body: errorMessage
        })

        if (options.debug) {
          info(`Prompt exceeded max token limit: ${TokenPrompt} > ${options.aimaxtokens}`)
        }

        return

      }else if (!options.aiLightModeluses && TokenPrompt <= options.aimaxtokens) {

        // Prompt is within the limits of the model, use it

        if (options.debug) {
          info(`\nPrompt token count is within limits: ${TokenPrompt} <= ${options.aimaxtokens}`)
          // Estimate the cost of the request
          const estimatedCost = ((TokenPrompt/1000) * options.pricePerToken).toFixed(6)
          info(`Estimated cost for this request: $${estimatedCost}`)
          const estimatedCostOut = ((TokenPrompt/1000) * options.priceperTokenout * 2).toFixed(6)
          info(`Estimated maximum cost for output: $${estimatedCostOut}`)
        }

        // AI Call
      
        if (options.debug) {
          info(`\n\n----------------------------\n\nDebugging Info - AI Call\n\n----------------------------\n`)
          info(`Calling AI bot with action: ${userCommand.action}`)
        }

      }else if (options.aiLightModeluses && TokenPrompt > options.lightmaxTokens) {

        // Prompt is to large for the light model, use the heavy model

        if (options.debug) {
          info(`\nPrompt token count exceeds light model limit: ${TokenPrompt} > ${options.lightmaxTokens}`)
          // Estimate the cost of the request
          info(`The heavy model will be used for this request.`)
        }

      }else if (options.aiLightModeluses && TokenPrompt <= options.lightmaxTokens) {

        // Prompt is within the limits of the light model, use it

        if (options.debug) {
          info(`\nPrompt token count is within limits of light model: ${TokenPrompt} <= ${options.lightmaxTokens}`)
          // Estimate the cost of the request
          const estimatedCost = ((TokenPrompt/1000) * options.pricePerToken).toFixed(6)
          info(`Estimated cost for this request: $${estimatedCost}`)
          const estimatedCostOut = ((TokenPrompt/1000) * options.pricelightperTokenout * 2).toFixed(6)
          info(`Estimated maximum cost for output: $${estimatedCostOut}`)
        }

        // AI Call
      
        if (options.debug) {
          info(`\n\n----------------------------\n\nDebugging Info - AI Call\n\n----------------------------\n`)
          info(`Calling AI bot with action: ${userCommand.action}`)
        }

      }else if (options.aiLightModeluses && TokenPrompt > options.heavymaxTokens) {

        // Prompt is too large for the heavy model, inform the user

        //Bot response to informe the user via comment
        const errorMessage = `❌ **Error**: The generated prompt exceeds the maximum token limit of ${options.heavymaxTokens} tokens.\n\n`
        + `Please try simplifying your request or reducing the number of target files.\n\n`
        + `**Command**: \`${userCommand.action} ${userCommand.filename || ''}\`\n`
        + `**Token count**: ${TokenPrompt}\n`
        + `**Max tokens allowed**: ${options.heavymaxTokens}\n\n`
        + `You can also try using a custom prompt with fewer files or simpler instructions.`
        + `Or use another model.`
        await octokit.rest.issues.createComment({
          owner: github_context.repo.owner,
          repo: github_context.repo.repo,
          issue_number: github_context.issue.number,
          body: errorMessage
        })

        if (options.debug) {
          info(`Prompt exceeded max token limit for the heavy bot : ${TokenPrompt} > ${options.heavymaxTokens}`)
        }

        return

      }else if (options.aiLightModeluses && TokenPrompt <= options.heavymaxTokens) {

        // Prompt is within the limits of the heavy model, use it

        if (options.debug) {
          info(`\nPrompt token count is within limits of light model: ${TokenPrompt} <= ${options.heavymaxTokens}`)
          // Estimate the cost of the request
          const estimatedCost = ((TokenPrompt/1000) * options.pricePerToken).toFixed(6)
          info(`Estimated cost for this request: $${estimatedCost}`)
          const estimatedCostOut = ((TokenPrompt/1000) * options.priceheavyperTokenout * 2).toFixed(6)
          info(`Estimated maximum cost for output: $${estimatedCostOut}`)
        }

        // AI Call
      
        if (options.debug) {
          info(`\n\n----------------------------\n\nDebugging Info - AI Call\n\n----------------------------\n\n`)
          info(`Calling AI bot with action: ${userCommand.action}`)
        }

      }else {
        // This should never happen, but just in case
        if (options.debug) {
          info(`!! Unexpected token count: ${TokenPrompt} !!`)
        }
      }

      
    } catch (error) {
      console.error('Error processing user command:', error)
      
      const errorMessage = `❌ **Processing Error**: Failed to process your request.\n\n`
        + `**Command**: \`${userCommand.action} ${userCommand.filename || ''}\`\n`
        + `**Error**: ${error instanceof Error ? error.message : 'Unknown error'}\n\n`
        + `Please try again or contact support if the issue persists.`
      
      await octokit.rest.issues.createComment({
        owner: github_context.repo.owner,
        repo: github_context.repo.repo,
        issue_number: github_context.issue.number,
        body: errorMessage
      })
    }
  } else {
    if (options.debug) {
      info(`Comment body: ${comment.body}`)
      info('Comment does not contain a valid command, ignoring')
    }
  }
}

/**
 * Main function to handle PR Analysis
 */
export async function handlePRAnalysis(
  options: Options,
  filesInfo: FilesInfo | null,
  filesDependencies: Map<string, FileData>,
  testsToModify: string[],
  lightBot: Bot | null,
  heavyBot: Bot | null,
  prompts: Prompts
): Promise<void> {
  try {
    // check if the event is pull_request
    if (
      process.env.GITHUB_EVENT_NAME === 'pull_request' ||
      process.env.GITHUB_EVENT_NAME === 'pull_request_target'
    ) {
      await handlePullRequestEvent(options, filesInfo, filesDependencies, testsToModify)
    } else if (
      process.env.GITHUB_EVENT_NAME === 'pull_request_review_comment' ||
      process.env.GITHUB_EVENT_NAME === 'issue_comment'
    ) {
      await handleCommentEvent(options, filesInfo, filesDependencies, lightBot, heavyBot, prompts)
    } else {
      warning('Skipped: this action only works on push events or pull_request')
    }
  } catch (e: any) {
    if (e instanceof Error) {
      setFailed(`Failed to run PR Analysis: ${e.message}, backtrace: ${e.stack}`)
    } else {
      setFailed(`Failed to run PR Analysis: ${e}, backtrace: ${e.stack}`)
    }
  }
}
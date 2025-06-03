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

// ======= Utility Functions for Command Parsing =======

interface UserCommand {
  action: 'summarize tests' | 'generate tests' | 'all generate tests' | 'explain tests' | 'all explain tests' | 'sec check' | 'custom prompt' | 'all custom prompt'
  filename?: string // Optionnel car certaines commandes (all) n'ont pas besoin de filename
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
    let responseBody = `✅ **Command received**: \`${userCommand.action} ${userCommand.filename || ''}\`\n\n`
    
    switch (userCommand.action) {
      case 'summarize tests':
        responseBody += `📋 **Action**: Summarizing file diff for test generation\n`
        if (userCommand.filename) {
          responseBody += `📁 **Target file**: \`${userCommand.filename}\`\n`
        }
        if (userCommand.customPrompt) {
          responseBody += `💭 **Custom instructions**: ${userCommand.customPrompt}\n`
        }
        responseBody += `\nI will analyze the file changes and summarize what needs to be tested.\n`
        //Display the prompt that will be used if debug mod is enabled
        if (options.debug) {
          
        }
        // TODO: Call AI function with: summarizeFileDiffForTest(userCommand.filename, fileContent, relatedFiles, userCommand.customPrompt)
        break
        
      case 'generate tests':
        responseBody += `🔧 **Action**: Generating test implementations\n`
        responseBody += `📁 **Target file**: \`${userCommand.filename}\`\n`
        if (userCommand.customPrompt) {
          responseBody += `💭 **Custom instructions**: ${userCommand.customPrompt}\n`
        }
        responseBody += `\nI will generate comprehensive test implementations for this file.\n`
        //Display the prompt that will be used if debug mod is enabled
        if (options.debug) {
          
        }
        // TODO: Call AI function with: generateTests(userCommand.filename, fileContent, relatedFiles, userCommand.customPrompt)
        break
        
      case 'all generate tests':
        responseBody += `🔧 **Action**: Generating tests for all modified files\n`
        if (userCommand.customPrompt) {
          responseBody += `💭 **Custom instructions**: ${userCommand.customPrompt}\n`
        }
        responseBody += `\nI will generate comprehensive test implementations for all modified files.\n`
        //Display the prompt that will be used if debug mod is enabled
        if (options.debug) {
          
        }
        // TODO: Call AI function with: generateAllTests(allFiles, userCommand.customPrompt)
        break
        
      case 'explain tests':
        responseBody += `📋 **Action**: Explaining test requirements\n`
        responseBody += `📁 **Target file**: \`${userCommand.filename}\`\n`
        if (userCommand.customPrompt) {
          responseBody += `💭 **Custom instructions**: ${userCommand.customPrompt}\n`
        }
        responseBody += `\nI will analyze the file and explain what tests should be implemented.\n`
        //Display the prompt that will be used if debug mod is enabled
        if (options.debug) {
          
        }
        // TODO: Call AI function with: explainTests(userCommand.filename, fileContent, relatedFiles, userCommand.customPrompt)
        break
        
      case 'all explain tests':
        responseBody += `📋 **Action**: Explaining test requirements for all files\n`
        if (userCommand.customPrompt) {
          responseBody += `💭 **Custom instructions**: ${userCommand.customPrompt}\n`
        }
        responseBody += `\nI will analyze all modified files and explain what tests should be implemented.\n`
        //Display the prompt that will be used if debug mod is enabled
        if (options.debug) {
          
        }
        // TODO: Call AI function with: explainAllTests(allFiles, userCommand.customPrompt)
        break
        
      case 'sec check':
        responseBody += `🔒 **Action**: Security vulnerability analysis\n`
        responseBody += `📁 **Target file**: \`${userCommand.filename}\`\n`
        if (userCommand.customPrompt) {
          responseBody += `💭 **Custom instructions**: ${userCommand.customPrompt}\n`
        }
        responseBody += `\nI will analyze the file for potential security vulnerabilities.\n`
        //Display the prompt that will be used if debug mod is enabled
        if (options.debug) {
          
        }
        // TODO: Call AI function with: securityCheck(userCommand.filename, fileContent, relatedFiles, userCommand.customPrompt)
        break
        
      case 'custom prompt':
        responseBody += `🎯 **Action**: Custom analysis\n`
        responseBody += `📁 **Target file**: \`${userCommand.filename}\`\n`
        responseBody += `💭 **Custom instructions**: ${userCommand.customPrompt}\n\n`
        responseBody += `I will analyze the file based on your specific requirements.\n`
        //Display the prompt that will be used if debug mod is enabled
        if (options.debug) {
          
        }
        // TODO: Call AI function with: customPromptWithFiles(userCommand.filename, fileContent, relatedFiles, userCommand.customPrompt)
        break
        
      case 'all custom prompt':
        responseBody += `🎯 **Action**: Custom analysis for all files\n`
        responseBody += `💭 **Custom instructions**: ${userCommand.customPrompt}\n\n`
        responseBody += `I will analyze all modified files based on your specific requirements.\n`
        //Display the prompt that will be used if debug mod is enabled
        if (options.debug) {
          
        }
        // TODO: Call AI function with: customPromptWithAll(allFiles, userCommand.customPrompt)
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
      info(`Processed user command: ${userCommand.action} for file: ${userCommand.filename || 'all files'}`)
    }
  } else {
    if (options.debug) {
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
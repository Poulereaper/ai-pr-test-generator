import {info, warning} from '@actions/core'
import {context as github_context} from '@actions/github'
import {COMMENT_REPLY_TAG, Commenter} from './commenter'
import {Bot, Ids} from '../bot'
import {Inputs} from '../inputs'
import {Options} from '../options'
import {Prompts} from './prompts'
import {octokit} from '../octokit'

const context = github_context
const repo = context.repo
const ASK_TESTBOT = '@testbot'

export const analyzeFilesForTests = async (
  bot: Bot,
  options: Options,
  prompts: Prompts,
  fileSummaries: string[]
): Promise<string[]> => {
  // Create inputs for the test suggestion prompt
  const inputs = new Inputs()
  inputs.rawSummary = fileSummaries.join('\n')
  
  // Get test suggestions from the bot
  const [suggestion, _] = await bot.chat(prompts.renderSuggestTests(inputs), {})
  
  // Return the files that might need tests
  return suggestion
    .split('\n')
    .filter(line => line.trim().length > 0 && !line.toLowerCase().includes('no files need tests'))
}

export const suggestTestsInComment = async (
  commenter: Commenter,
  pullNumber: number,
  filesNeedingTests: string[]
): Promise<void> => {
  if (filesNeedingTests.length === 0) {
    return
  }

  const prefixMessage = `## Test Suggestions

Based on the changes in this PR, I've identified some files that may benefit from additional tests.
If you'd like me to generate test code for any of these changes, please comment with:
\`@testbot generate tests for <filename>\`

Files that might need tests:
`

  const fileList = filesNeedingTests
    .map(file => `- ${file}`)
    .join('\n')

  const message = `${prefixMessage}\n${fileList}`
  await commenter.createTestSuggestionComment(pullNumber, message)
}

export const handleTestGenerationComment = async (
  bot: Bot,
  options: Options,
  prompts: Prompts
): Promise<void> => {
  const commenter: Commenter = new Commenter()
  const inputs: Inputs = new Inputs()

  if (context.eventName !== 'pull_request_review_comment' && 
      context.eventName !== 'issue_comment') {
    return
  }

  if (!context.payload) {
    warning(`Skipped: ${context.eventName} event is missing payload`)
    return
  }

  const comment = context.payload.comment
  if (comment == null) {
    warning(`Skipped: ${context.eventName} event is missing comment`)
    return
  }

  // Check if the comment was created and not edited or deleted
  if (context.payload.action !== 'created') {
    warning(`Skipped: ${context.eventName} event is not created`)
    return
  }

  // Check if this is a test generation request
  if (!comment.body.includes(ASK_TESTBOT) || 
      !commenter.isTestGenerationRequest(comment.body)) {
    return
  }

  // Extract the filename from the request
  const filename = commenter.extractFilenameFromTestRequest(comment.body)
  if (!filename) {
    warning(`Skipped: Could not extract filename from test generation request`)
    return
  }

  // Get PR information
  if (context.payload.pull_request == null || context.payload.repository == null) {
    warning(`Skipped: ${context.eventName} event is missing pull_request`)
    return
  }

  const pullNumber = context.payload.pull_request.number
  inputs.title = context.payload.pull_request.title
  if (context.payload.pull_request.body) {
    inputs.description = commenter.getDescription(context.payload.pull_request.body)
  }

  // Get the file content and diff
  try {
    // Get diff for this file by comparing the base and head commits
    const diffAll = await octokit.repos.compareCommits({
      owner: repo.owner,
      repo: repo.repo,
      base: context.payload.pull_request.base.sha,
      head: context.payload.pull_request.head.sha
    })

    if (diffAll.data) {
      const files = diffAll.data.files
      if (files != null) {
        const file = files.find(f => f.filename === filename)
        if (file != null && file.patch) {
          inputs.fileDiff = file.patch
          inputs.filename = filename
        }
      }
    }

    // Get file content
    const {data: fileContent} = await octokit.repos.getContent({
      owner: repo.owner,
      repo: repo.repo,
      path: filename,
      ref: context.payload.pull_request.head.sha
    })

    if (fileContent && 'content' in fileContent) {
      // Base64 decode the content
      inputs.fileContent = Buffer.from(fileContent.content, 'base64').toString('utf8')
    }
  } catch (error) {
    warning(`Failed to get file information: ${error}, skipping.`)
    await commenter.reviewCommentReply(
      pullNumber,
      comment.id,
      `@${comment.user.login} I couldn't find the file ${filename} or get its content. Please make sure the file exists and try again.`
    )
    return
  }

  // Get a reply ID to respond to
  let replyToId = comment.id
  if (context.eventName === 'issue_comment') {
    // For issue comments, we need to create a new comment
    replyToId = null
  }

  // Generate the tests
  const [testCode, ids]: [string, Ids] = await bot.chat(
    prompts.renderGenerateTests(inputs), 
    {}
  )

  // Post the test code as a reply
  if (replyToId) {
    await commenter.reviewCommentReply(
      pullNumber,
      replyToId,
      `@${comment.user.login} Here are the tests for ${filename}:\n\n${testCode}`
    )
  } else {
    await octokit.issues.createComment({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: pullNumber,
      body: `${COMMENT_REPLY_TAG}\n@${comment.user.login} Here are the tests for ${filename}:\n\n${testCode}`
    })
  }
}
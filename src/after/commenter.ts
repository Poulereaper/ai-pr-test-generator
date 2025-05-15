import {info, warning} from '@actions/core'
import {context as github_context} from '@actions/github'
import {octokit} from '../octokit'

export const SUMMARIZE_TAG = '<!-- TESTBOT_SUMMARY -->'
export const COMMENT_TAG = '<!-- TESTBOT_COMMENT -->'
export const COMMENT_REPLY_TAG = '<!-- TESTBOT_REPLY -->'
export const TEST_SUGGESTION_TAG = '<!-- TESTBOT_TEST_SUGGESTION -->'

const context = github_context
const repo = context.repo

export class Commenter {
  async createSummaryComment(
    pullNumber: number,
    content: string
  ): Promise<void> {
    try {
      // Check if there's already a summary comment
      let existingComment = await this.findCommentWithTag(
        SUMMARIZE_TAG,
        pullNumber
      )

      const body = `${SUMMARIZE_TAG}\n${content}`

      if (existingComment) {
        // Update the existing comment
        await octokit.issues.updateComment({
          owner: repo.owner,
          repo: repo.repo,
          comment_id: existingComment.id,
          body
        })
        if (process.env.GITHUB_STEP_SUMMARY) {
          info(`Updated comment: ${existingComment.html_url}`)
        }
      } else {
        // Create a new comment
        const {data: comment} = await octokit.issues.createComment({
          owner: repo.owner,
          repo: repo.repo,
          issue_number: pullNumber,
          body
        })
        if (process.env.GITHUB_STEP_SUMMARY) {
          info(`Created comment: ${comment.html_url}`)
        }
      }
    } catch (e: any) {
      warning(`Failed to create summary comment: ${e}, backtrace: ${e.stack}`)
    }
  }

  async createTestSuggestionComment(
    pullNumber: number,
    content: string
  ): Promise<void> {
    try {
      // Check if there's already a test suggestion comment
      let existingComment = await this.findCommentWithTag(
        TEST_SUGGESTION_TAG,
        pullNumber
      )

      const body = `${TEST_SUGGESTION_TAG}\n${content}`

      if (existingComment) {
        // Update the existing comment
        await octokit.issues.updateComment({
          owner: repo.owner,
          repo: repo.repo,
          comment_id: existingComment.id,
          body
        })
        if (process.env.GITHUB_STEP_SUMMARY) {
          info(`Updated test suggestion comment: ${existingComment.html_url}`)
        }
      } else {
        // Create a new comment
        const {data: comment} = await octokit.issues.createComment({
          owner: repo.owner,
          repo: repo.repo,
          issue_number: pullNumber,
          body
        })
        if (process.env.GITHUB_STEP_SUMMARY) {
          info(`Created test suggestion comment: ${comment.html_url}`)
        }
      }
    } catch (e: any) {
      warning(`Failed to create test suggestion comment: ${e}, backtrace: ${e.stack}`)
    }
  }

  async reviewComment(
    pullNumber: number,
    commitId: string,
    path: string,
    position: number | null,
    startLine: number | null,
    endLine: number | null,
    body: string
  ): Promise<void> {
    try {
      const params: any = {
        owner: repo.owner,
        repo: repo.repo,
        pull_number: pullNumber,
        commit_id: commitId,
        path,
        body: `${COMMENT_TAG}\n${body}`
      }

      if (position !== null) {
        params.position = position
      } else if (startLine !== null && endLine !== null) {
        params.start_line = startLine
        params.line = endLine
      }

      const result = await octokit.pulls.createReviewComment(params)

      if (process.env.GITHUB_STEP_SUMMARY) {
        info(`Created review comment: ${result.data.html_url}`)
      }
    } catch (e: any) {
      warning(`Failed to create review comment: ${e}, backtrace: ${e.stack}`)
    }
  }

  async reviewCommentReply(
    pullNumber: number,
    inReplyTo: number,
    body: string
  ): Promise<void> {
    try {
      const result = await octokit.pulls.createReplyForReviewComment({
        owner: repo.owner,
        repo: repo.repo,
        pull_number: pullNumber,
        comment_id: inReplyTo,
        body: `${COMMENT_REPLY_TAG}\n${body}`
      })

      if (process.env.GITHUB_STEP_SUMMARY) {
        info(`Created review comment reply: ${result.data.html_url}`)
      }
    } catch (e: any) {
      warning(
        `Failed to create review comment reply: ${e}, backtrace: ${e.stack}`
      )
    }
  }

  async findCommentWithTag(tag: string, pullNumber: number): Promise<any> {
    const {data: comments} = await octokit.issues.listComments({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: pullNumber
    })

    return comments.find(comment => comment.body?.includes(tag))
  }

  getDescription(body: string): string {
    // If body is empty, return a placeholder message
    if (!body) {
      return 'No description provided'
    }

    return body.trim()
  }

  getShortSummary(body: string): string {
    return body.replace(SUMMARIZE_TAG, '').trim()
  }

  async getCommentChain(
    pullNumber: number,
    comment: any
  ): Promise<{chain: string; topLevelComment: number}> {
    let chain = ''
    let topLevelComment = 0

    try {
      // If the comment is already a reply, find its parent
      if (comment.in_reply_to_id) {
        // This is a reply, so we'll look for its parent
        const {data: reviewComment} = await octokit.pulls.getReviewComment({
          owner: repo.owner,
          repo: repo.repo,
          comment_id: comment.in_reply_to_id
        })

        // Use the parent as the top-level comment
        topLevelComment = reviewComment.id

        // Add parent to the chain first
        chain += `${reviewComment.user.login}: ${reviewComment.body}\n`

        // Then get all replies to this parent
        const {data: replies} = await octokit.pulls.listReviewComments({
          owner: repo.owner,
          repo: repo.repo,
          pull_number: pullNumber,
          in_reply_to: reviewComment.id
        })

        // Sort replies by creation time
        const sortedReplies = replies.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )

        // Add all replies to the chain
        for (const reply of sortedReplies) {
          chain += `${reply.user.login}: ${reply.body}\n`
        }
      } else {
        // This is a top-level comment
        topLevelComment = comment.id
        chain += `${comment.user.login}: ${comment.body}\n`

        // Get all replies to this comment
        const {data: replies} = await octokit.pulls.listReviewComments({
          owner: repo.owner,
          repo: repo.repo,
          pull_number: pullNumber,
          in_reply_to: comment.id
        })

        // Sort replies by creation time
        const sortedReplies = replies.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )

        // Add all replies to the chain
        for (const reply of sortedReplies) {
          chain += `${reply.user.login}: ${reply.body}\n`
        }
      }
    } catch (e: any) {
      warning(`Error getting comment chain: ${e}, backtrace: ${e.stack}`)
    }

    return {chain, topLevelComment}
  }

  // Check if a file needs tests based on the triage result
  needsTests(triageResult: string): boolean {
    return triageResult.includes('NEEDS_TESTS')
  }

  // Extract filename from a test generation request
  extractFilenameFromTestRequest(comment: string): string | null {
    const match = comment.match(/@testbot\s+generate\s+tests\s+for\s+(.+?)(?:\s|$)/i)
    return match ? match[1] : null
  }

  // Check if comment is a test generation request
  isTestGenerationRequest(comment: string): boolean {
    return comment.toLowerCase().includes('@testbot generate tests')
  }
}
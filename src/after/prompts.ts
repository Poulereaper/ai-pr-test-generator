import {type Inputs} from '../inputs'

// This bot was created to generate test cases for the code changes
//In this perspective the prompts available are :
// 1. summarizeFileDifffortest
// 2. suggestTests -> For one files in cases there are in theory to many modifications to generate
// 3. suggestallTests -> For all files in cases there juste a few modifications to generate
// 4. generateTests -> For one file (work with 2)
// 5. generateAllTests -> For all files (work with 3)

export class Prompts {
  summarize: string
  summarizeReleaseNotes: string
  suggestTests: string
  generateTests: string

  summarizeFileDiff = `## GitHub PR Title

\`$title\` 

## Description

\`\`\`
$description
\`\`\`

## Diff

\`\`\`diff
$file_diff
\`\`\`

## Instructions

I would like you to succinctly summarize the diff within 100 words.
If applicable, your summary should include a note about alterations 
to the signatures of exported functions, global data structures and 
variables, and any changes that might affect the external interface or 
behavior of the code.
`
  triageFileDiff = `Below the summary, I would also like you to triage the diff as \`NEEDS_REVIEW\` or 
\`APPROVED\` based on the following criteria:

- If the diff involves any modifications to the logic or functionality, even if they 
  seem minor, triage it as \`NEEDS_REVIEW\`. This includes changes to control structures, 
  function calls, or variable assignments that might impact the behavior of the code.
- If the diff only contains very minor changes that don't affect the code logic, such as 
  fixing typos, formatting, or renaming variables for clarity, triage it as \`APPROVED\`.

Additionally, if you detect that the file modified contains logic that should be tested, 
triage it as \`NEEDS_TESTS\` along with \`NEEDS_REVIEW\`.

Please evaluate the diff thoroughly and take into account factors such as the number of 
lines changed, the potential impact on the overall system, and the likelihood of 
introducing new bugs or security vulnerabilities. 
When in doubt, always err on the side of caution and triage the diff as \`NEEDS_REVIEW\`.

You must strictly follow the format below for triaging the diff:
[TRIAGE]: <NEEDS_REVIEW or APPROVED or NEEDS_TESTS>

Important:
- In your summary do not mention that the file needs a through review or caution about
  potential issues.
- Do not provide any reasoning why you triaged the diff as \`NEEDS_REVIEW\` or \`APPROVED\` or \`NEEDS_TESTS\`.
- Do not mention that these changes affect the logic or functionality of the code in 
  the summary. You must only use the triage status format above to indicate that.
`
  summarizeChangesets = `Provided below are changesets in this pull request. Changesets 
are in chronlogical order and new changesets are appended to the
end of the list. The format consists of filename(s) and the summary 
of changes for those files. There is a separator between each changeset.
Your task is to deduplicate and group together files with
related/similar changes into a single changeset. Respond with the updated 
changesets using the same format as the input. 

$raw_summary
`

  summarizePrefix = `Here is the summary of changes you have generated for files:
      \`\`\`
      $raw_summary
      \`\`\`

`

  summarizeShort = `Your task is to provide a concise summary of the changes. This 
summary will be used as a prompt while reviewing each file and must be very clear for 
the AI bot to understand. 

Instructions:

- Focus on summarizing only the changes in the PR and stick to the facts.
- Do not provide any instructions to the bot on how to perform the review.
- Do not mention that files need a through review or caution about potential issues.
- Do not mention that these changes affect the logic or functionality of the code.
- The summary should not exceed 500 words.
`

  suggestTestsPrefix = `Based on the changes in this PR, I've identified some files that may benefit from additional tests.
If you'd like me to generate test code for any of these changes, please comment with:
\`@testbot generate tests for <filename>\`

I can create appropriate unit tests considering the changes you've made.
`

  suggestTests = `I need you to analyze the changes in the PR and identify which files could benefit from additional tests.
Focus on files that have significant logic changes, new functionality, or complex modifications.

For each file that needs tests, explain in 1-2 sentences why tests would be valuable (e.g., "Implements new authentication logic" 
or "Modifies critical data processing workflow").

Respond with a concise list of files that need tests. If no files need tests, simply state that all changes are well-covered
or don't require additional tests.

PR Summary:
\`\`\`
$raw_summary
\`\`\`
`

  generateTests = `You are tasked with generating comprehensive tests for a file that has been modified in a pull request.
Focus on creating tests that verify the new or modified functionality works as expected.

## File Information
- Filename: \`$filename\`
- PR Title: \`$title\`
- PR Description: 
\`\`\`
$description
\`\`\`

## File Changes (Diff)
\`\`\`diff
$file_diff
\`\`\`

## Instructions
1. Analyze the changes and identify what functionality needs to be tested
2. Generate appropriate test code in the same language as the source file
3. Include detailed comments explaining what each test is verifying
4. Focus on testing the changed/new functionality, not the entire file
5. Write tests that are comprehensive but focused on the changes
6. Use appropriate test frameworks and methodologies for the language/ecosystem

Your response should include:
1. A brief explanation of your testing approach
2. The complete test code that can be directly added to the codebase
3. Any setup instructions or dependencies needed for the tests

Remember to import necessary libraries and create appropriate mocks if needed.
`

  reviewFileDiff = `## GitHub PR Title

\`$title\` 

## Description

\`\`\`
$description
\`\`\`

## Summary of changes

\`\`\`
$short_summary
\`\`\`

## IMPORTANT Instructions

Input: New hunks annotated with line numbers and old hunks (replaced code). Hunks represent incomplete code fragments.
Additional Context: PR title, description, summaries and comment chains.
Task: Review new hunks for substantive issues using provided context and respond with comments if necessary.
Output: Review comments in markdown with exact line number ranges in new hunks. Start and end line numbers must be within the same hunk. For single-line comments, start=end line number. Must use example response format below.
Use fenced code blocks using the relevant language identifier where applicable.
Don't annotate code snippets with line numbers. Format and indent code correctly.
Do not use \`suggestion\` code blocks.
For fixes, use \`diff\` code blocks, marking changes with \`+\` or \`-\`. The line number range for comments with fix snippets must exactly match the range to replace in the new hunk.

- Do NOT provide general feedback, summaries, explanations of changes, or praises 
  for making good additions. 
- Focus solely on offering specific, objective insights based on the 
  given context and refrain from making broad comments about potential impacts on 
  the system or question intentions behind the changes.

If there are no issues found on a line range, you MUST respond with the 
text \`LGTM!\` for that line range in the review section. 

## Example

### Example changes

---new_hunk---
\`\`\`
  z = x / y
    return z

20: def add(x, y):
21:     z = x + y
22:     retrn z
23: 
24: def multiply(x, y):
25:     return x * y

def subtract(x, y):
  z = x - y
\`\`\`
  
---old_hunk---
\`\`\`
  z = x / y
    return z

def add(x, y):
    return x + y

def subtract(x, y):
    z = x - y
\`\`\`

---comment_chains---
\`\`\`
Please review this change.
\`\`\`

---end_change_section---

### Example response

22-22:
There's a syntax error in the add function.
\`\`\`diff
-    retrn z
+    return z
\`\`\`
---
24-25:
LGTM!
---

## Changes made to \`$filename\` for your review

$patches
`

  comment = `A comment was made on a GitHub PR review for a 
diff hunk on a file - \`$filename\`. I would like you to follow 
the instructions in that comment. 

## GitHub PR Title

\`$title\`

## Description

\`\`\`
$description
\`\`\`

## Summary generated by the AI bot

\`\`\`
$short_summary
\`\`\`

## Entire diff

\`\`\`diff
$file_diff
\`\`\`

## Diff being commented on

\`\`\`diff
$diff
\`\`\`

## Instructions

Please reply directly to the new comment (instead of suggesting 
a reply) and your reply will be posted as-is.

If the comment contains instructions/requests for you, please comply. 
If the comment contains a request to generate tests (e.g., "@testbot generate tests"),
please generate appropriate tests for the file that match its functionality.

In your reply, please make sure to begin the reply by tagging the user 
with "@user".

## Comment format

\`user: comment\`

## Comment chain (including the new comment)

\`\`\`
$comment_chain
\`\`\`

## The comment/request that you need to directly reply to

\`\`\`
$comment
\`\`\`
`

  constructor(summarize = '', summarizeReleaseNotes = '') {
    this.summarize = summarize
    this.summarizeReleaseNotes = summarizeReleaseNotes
    this.suggestTests = this.suggestTests
    this.generateTests = this.generateTests
  }

  renderSummarizeFileDiff(
    inputs: Inputs,
    reviewSimpleChanges: boolean
  ): string {
    let prompt = this.summarizeFileDiff
    if (reviewSimpleChanges === false) {
      prompt += this.triageFileDiff
    }
    return inputs.render(prompt)
  }

  renderSummarizeChangesets(inputs: Inputs): string {
    return inputs.render(this.summarizeChangesets)
  }

  renderSummarize(inputs: Inputs): string {
    const prompt = this.summarizePrefix + this.summarize
    return inputs.render(prompt)
  }

  renderSummarizeShort(inputs: Inputs): string {
    const prompt = this.summarizePrefix + this.summarizeShort
    return inputs.render(prompt)
  }

  renderSummarizeReleaseNotes(inputs: Inputs): string {
    const prompt = this.summarizePrefix + this.summarizeReleaseNotes
    return inputs.render(prompt)
  }

  renderSuggestTests(inputs: Inputs): string {
    return inputs.render(this.suggestTests)
  }

  renderGenerateTests(inputs: Inputs): string {
    return inputs.render(this.generateTests)
  }

  renderComment(inputs: Inputs): string {
    return inputs.render(this.comment)
  }

  renderReviewFileDiff(inputs: Inputs): string {
    return inputs.render(this.reviewFileDiff)
  }
}
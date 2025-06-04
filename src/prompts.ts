import {type Inputs} from './inputs'

// This bot was created to generate test cases for the code changes
//In this perspective the prompts available are :
// 1. summarizeFileDifffortest
// 2. explainTests -> For one files in cases there are in theory to many modifications to generate
// 3. explainallTests -> For all files in cases there juste a few modifications to generate
// 4. generateTests -> For one file or more files 
// 5. generateAllTests -> For all files 
// For 1 to 5 it is possible for the user to had a custom prompt to the bot, by adding text after his choice.
// 6. seccheck -> For security check only on one file
// 7. custompromptWithFiles -> For custom prompt with files
// 8. custompromptWithall -> For custom prompt with all files

export class Prompts {
  //Adapte according to the bot after
  
  // 1. Summarize file diff for test generation purposes
  summarizeFileDiffForTest = `## GitHub PR Analysis for Test Generation

### PR Information
**Title**: \`$title\`
**Description**: 
\`\`\`
$description
\`\`\`

### Project's Structure
Here is the structure of the project, analyse and understand all the files and directories to master our entire codebase.
$project_struct

### File: \`$filename\`

### Changes (Diff)
\`\`\`diff
$file_diff
\`\`\`

### Related Files Context
$related_files_content

## Instructions

You are an expert test engineer analyzing code changes to understand what needs to be tested.

**Your task**: Provide a concise but comprehensive summary (max 200 words) of the changes in this file, focusing specifically on:

1. **New functionality** that requires testing
2. **Modified behavior** that needs test updates
3. **Edge cases** introduced by the changes
4. **Dependencies** with other components that should be tested
5. **Potential breaking changes** that need regression tests

**Focus on testing implications**: Don't just describe what changed, but explain what aspects of these changes need to be verified through tests.

**Custom Instructions**: $custom_prompt

Format your response as:
## Summary
[Your analysis]

## Testing Focus Areas
- [Key area 1]
- [Key area 2]
- [etc.]
`

  // 2. Explain what tests should be implemented for one specific file
  explainTests = `## Test Planning for Single File

### PR Information
**Title**: \`$title\`
**Description**: 
\`\`\`
$description
\`\`\`

### Project's Structure
Here is the structure of the project, analyse and understand all the files and directories to master our entire codebase.
$project_struct

### Target File: \`$filename\`

### File Changes
\`\`\`diff
$file_diff
\`\`\`

### File Content (Current State)
\`\`\`
$file_content
\`\`\`

### Related Files & Dependencies
$related_files_content

### Existing Tests (if any)
$existing_tests_content

## Instructions

You are a senior test architect. Analyze this file and create a comprehensive test plan.

**Your task**: Explain what tests should be implemented for this file, considering:

1. **Unit Tests**: What functions/methods need individual testing
2. **Integration Tests**: How this file interacts with dependencies
3. **Edge Cases**: Boundary conditions and error scenarios
4. **Regression Tests**: Ensure existing functionality still works
5. **Performance Tests**: If applicable for the changes
6. **Security Tests**: If the changes involve sensitive operations

For each test category, explain:
- **What** needs to be tested
- **Why** it's important
- **How** it should be approached (testing strategy)
- **Priority level** (High/Medium/Low)

**Custom Instructions**: $custom_prompt

## Expected Response Format:

### Test Strategy Overview
[Brief overview of your testing approach]

### Recommended Tests

#### Unit Tests (Priority: High/Medium/Low)
- **Test Name**: Description and rationale
- **Test Name**: Description and rationale

#### Integration Tests (Priority: High/Medium/Low)
- **Test Name**: Description and rationale

#### Edge Cases & Error Handling (Priority: High/Medium/Low)
- **Test Name**: Description and rationale

#### Other Test Types
[Any additional testing needs]

### Testing Prerequisites
- Required mocks/stubs
- Test data setup
- Environment considerations
`

  // 3. Explain what tests should be implemented for all modified files
  explainAllTests = `## Comprehensive Test Planning for PR

### PR Information
**Title**: \`$title\`
**Description**: 
\`\`\`
$description
\`\`\`

### Project's Structure
Here is the structure of the project, analyse and understand all the files and directories to master our entire codebase.
$project_struct

### Files Changes
\`\`\`diff
$file_diff
\`\`\`

### All Modified Files (Current State)
\`\`\`
$file_content
\`\`\`

### Dependencies & Related Files
$related_files_content

### Existing Test Coverage
$existing_tests_content

## Instructions

You are a test architect reviewing an entire PR. Create a comprehensive testing strategy for all changes.

**Your task**: Provide a holistic test plan that covers:

1. **File-by-file testing needs** (prioritized)
2. **Cross-file integration testing** requirements
3. **System-level testing** considerations
4. **Regression testing** strategy
5. **Test execution order** and dependencies

For each file, briefly explain:
- What tests are needed and why
- How it integrates with other changed files
- Priority level for testing

**Custom Instructions**: $custom_prompt

## Expected Response Format:

### Overall Testing Strategy
[High-level approach for testing this PR]

### Priority Files for Testing
1. **High Priority**: Files that absolutely need tests
2. **Medium Priority**: Files that should have tests
3. **Low Priority**: Files with minimal testing needs

### File-by-File Test Requirements

#### \`filename1\`
- **Unit Tests**: [Brief description]
- **Integration Tests**: [Brief description]
- **Priority**: High/Medium/Low
- **Rationale**: [Why this level of testing]

#### \`filename2\`
[Same format]

### Cross-File Integration Tests
- **Integration Point 1**: Description and importance
- **Integration Point 2**: Description and importance

### System-Level Considerations
- End-to-end testing needs
- Performance impact testing
- Security considerations

### Test Execution Strategy
- Suggested test order
- Dependencies between tests
- Environment setup needs
`

  // 4. Generate actual test code for a specific file
  generateTestsForFile = `## Test Code Generation

### PR Information
**Title**: \`$title\`
**Description**: 
\`\`\`
$description
\`\`\`

### Project's Structure
Here is the structure of the project, analyse and understand all the files and directories to master our entire codebase.
$project_struct

### Target File: \`$filename\`

### File Changes
\`\`\`diff
$file_diff
\`\`\`

### Complete File Content
\`\`\`
$file_content
\`\`\`

### Related Files & Dependencies
$related_files_content

### Existing Tests (for reference)
$existing_tests_content

### Project Test Framework Info
$test_framework_info

## Instructions

You are an expert test developer. Generate comprehensive, production-ready test code for this file.

**Requirements**:
1. **Use the project's existing test framework** and conventions
2. **Focus on the changed/new functionality** primarily
3. **Include comprehensive test coverage**: happy path, edge cases, error conditions
4. **Write clear, maintainable test code** with descriptive names
5. **Include necessary mocks/stubs** for dependencies
6. **Add helpful comments** explaining complex test scenarios
7. **Follow testing best practices** (AAA pattern, single responsibility, etc.)

**Test Types to Include**:
- Unit tests for individual functions/methods
- Integration tests for component interactions
- Error handling and edge case tests
- Mocking external dependencies appropriately

**Custom Instructions**: $custom_prompt

## Expected Response Format:

### Test File Structure
[Explain the test file organization]

### Required Dependencies & Imports
\`\`\`[language]
// All necessary imports and setup
\`\`\`

### Test Implementation
\`\`\`[language]
// Complete, runnable test code with:
// - Descriptive test names
// - Proper setup/teardown
// - Comprehensive assertions
// - Clear comments for complex scenarios
\`\`\`

### Setup Instructions
- How to run these tests
- Any additional dependencies needed
- Mock data or fixtures required

### Coverage Notes
- What functionality is covered
- Any gaps or limitations
- Suggestions for additional tests
`

  // 5. Generate tests for all modified files
  generateAllTests = `## Comprehensive Test Generation for PR

### PR Information
**Title**: \`$title\`
**Description**: 
\`\`\`
$description
\`\`\`

### Project's Structure
Here is the structure of the project, analyse and understand all the files and directories to master our entire codebase.
$project_struct

### Files Changes
\`\`\`diff
$file_diff
\`\`\`

### All Modified Files and Content (Current State)
\`\`\`
$file_content
\`\`\`

### Dependencies & Related Files
$related_files_content

### Existing Test Structure
$existing_tests_content

### Project Test Framework Info
$test_framework_info

## Instructions

You are a senior test developer creating a complete test suite for this PR. Generate production-ready tests for all modified files.

**Requirements**:
1. **Prioritize test creation** based on file importance and complexity
2. **Ensure cross-file integration testing** where files interact
3. **Maintain consistency** in testing patterns across all files
4. **Create efficient test structure** avoiding duplication
5. **Include setup/teardown** for shared test resources

**Approach**:
- Start with highest priority files
- Create individual test files for each source file
- Add integration tests for file interactions
- Include shared test utilities if needed

**Custom Instructions**: $custom_prompt

## Expected Response Format:

### Test Suite Overview
[Overall structure and organization of tests]

### Shared Test Utilities (if needed)
\`\`\`[language]
// Common test helpers, mocks, fixtures
\`\`\`

### Test Files

#### Tests for \`filename1\` → \`filename1.test.[ext]\`
\`\`\`[language]
// Complete test implementation
\`\`\`

#### Tests for \`filename2\` → \`filename2.test.[ext]\`
\`\`\`[language]
// Complete test implementation
\`\`\`

### Integration Tests → \`integration.test.[ext]\`
\`\`\`[language]
// Cross-file integration tests
\`\`\`

### Test Execution Guide
- How to run the complete test suite
- Dependencies and setup requirements
- Expected test coverage metrics
- CI/CD integration notes
`

  // 6. Security check for a specific file
  securityCheck = `## Security Analysis

### PR Information
**Title**: \`$title\`
**Description**: 
\`\`\`
$description
\`\`\`

### Project's Structure
Here is the structure of the project, analyse and understand all the files and directories to master our entire codebase.
$project_struct

### Target File: \`$filename\`

### File Changes
\`\`\`diff
$file_diff
\`\`\`

### Complete File Content
\`\`\`
$file_content
\`\`\`

### Related Files & Dependencies
$related_files_content

## Instructions

You are a cybersecurity expert conducting a security review of this code change.

**Your task**: Perform a comprehensive security analysis focusing on:

1. **Input Validation**: Are user inputs properly validated and sanitized?
2. **Authentication & Authorization**: Are access controls properly implemented?
3. **Data Exposure**: Could sensitive data be leaked or exposed?
4. **Injection Attacks**: SQL injection, XSS, command injection vulnerabilities?
5. **Cryptographic Issues**: Weak encryption, poor key management?
6. **Business Logic Flaws**: Logic bypasses or privilege escalation?
7. **Dependencies**: Security issues in imported libraries or modules?
8. **Error Handling**: Do error messages expose sensitive information?

**Custom Instructions**: $custom_prompt

## Expected Response Format:

### Security Assessment Summary
[Overall security posture: SECURE/REVIEW_NEEDED/VULNERABLE]

### Identified Security Issues

#### High Severity Issues
- **Issue**: [Description]
- **Location**: [File lines or functions]
- **Impact**: [Potential consequences]
- **Recommendation**: [How to fix]

#### Medium Severity Issues
[Same format]

#### Low Severity Issues / Best Practices
[Same format]

### Security Test Recommendations
- **Penetration tests** to perform
- **Automated security scanning** to run
- **Manual verification** steps

### Secure Coding Recommendations
- General security improvements
- Preventive measures for future changes
- Security-focused code review checklist items

### Compliance Considerations
[If applicable: GDPR, HIPAA, PCI-DSS, etc.]
`

  // 7. Custom prompt with specific files
  customPromptWithFiles = `## Custom Analysis Request

### PR Information
**Title**: \`$title\`
**Description**: 
\`\`\`
$description
\`\`\`

### Project's Structure
Here is the structure of the project, analyse and understand all the files and directories to master our entire codebase.
$project_struct

### Target File: \`$filename\`

### File Changes
\`\`\`diff
$file_diff
\`\`\`

### Complete File Content
\`\`\`
$file_content
\`\`\`

### Related Files & Dependencies
$related_files_content

### Existing Tests (for context)
$existing_tests_content

## Custom Instructions from User

$custom_prompt

## AI Assistant Instructions

You are an expert software engineer and analyst. The user has provided specific instructions above for analyzing this file and its changes.

**Your task**:
1. **Follow the user's custom instructions precisely**
2. **Consider the full context** of the file, its changes, and related files
3. **Provide actionable, detailed analysis** based on their request
4. **Structure your response clearly** with appropriate sections and formatting
5. **Include code examples** when relevant to illustrate your points

**Response Guidelines**:
- Be thorough and professional
- Use the file content and diff to provide specific, accurate insights
- If the request involves code generation, provide complete, runnable code
- If the request involves analysis, provide detailed explanations with examples
- Format code blocks with appropriate syntax highlighting

## Your Response:

[Provide your analysis/response based on the user's custom instructions]
`

  // 8. Custom prompt with all files
  customPromptWithAll = `## Custom Analysis Request - All Files

### PR Information
**Title**: \`$title\`
**Description**: 
\`\`\`
$description
\`\`\`

### Project's Structure
Here is the structure of the project, analyse and understand all the files and directories to master our entire codebase.
$project_struct

### All Modified Files and Content (Current State)
\`\`\`
$file_content
\`\`\`

### Dependencies & Related Files
$related_files_content

### Existing Test Structure
$existing_tests_content

### Project Context
$project_context

## Custom Instructions from User

$custom_prompt

## AI Assistant Instructions

You are an expert software architect and analyst. The user has provided specific instructions above for analyzing this entire PR and all its changes.

**Your task**:
1. **Follow the user's custom instructions precisely**
2. **Consider the holistic view** of all changes across files
3. **Analyze interactions** between modified files
4. **Provide comprehensive analysis** that covers the entire scope of changes
5. **Structure your response logically** with clear sections

**Response Guidelines**:
- Take a system-wide perspective
- Consider how files interact and depend on each other
- Provide detailed, actionable insights
- Use specific examples from the code when illustrating points
- If code generation is requested, ensure consistency across all generated code
- Format all code blocks with appropriate syntax highlighting

**Scope Considerations**:
- File interdependencies
- System architecture implications
- Performance considerations across all changes
- Security implications of the combined changes
- Testing strategy for the entire changeset

## Your Response:

[Provide your comprehensive analysis/response based on the user's custom instructions, considering all files and their interactions]
`

  constructor() {
    // Initialize any properties if needed o_o
  }

  renderSummarizeFileDiffForTest(inputs: Inputs): string {
    return inputs.render(this.summarizeFileDiffForTest)
  }

  renderExplainTests(inputs: Inputs): string {
    return inputs.render(this.explainTests)
  }

  renderExplainAllTests(inputs: Inputs): string {
    return inputs.render(this.explainAllTests)
  }

  renderGenerateTestsForFile(inputs: Inputs): string {
    return inputs.render(this.generateTestsForFile)
  }

  renderGenerateAllTests(inputs: Inputs): string {
    return inputs.render(this.generateAllTests)
  }

  renderSecurityCheck(inputs: Inputs): string {
    return inputs.render(this.securityCheck)
  }

  renderCustomPromptWithFiles(inputs: Inputs): string {
    return inputs.render(this.customPromptWithFiles)
  }

  renderCustomPromptWithAll(inputs: Inputs): string {
    return inputs.render(this.customPromptWithAll)
  }

}
export interface InputsConfig {
  systemMessage?: string
  title?: string
  description?: string
  rawSummary?: string
  shortSummary?: string
  filename?: string
  file_content?: string
  fileContent?: string
  patches?: string
  diff?: string
  file_diff?: string
  commentChain?: string
  comment?: string
  custom_prompt?: string
  related_files_content?: string
  existing_tests_content?: string
  all_files_content?: string
  test_framework_info?: string
  project_context?: string
}

export class Inputs {
  systemMessage: string
  title: string
  description: string
  rawSummary: string
  shortSummary: string
  filename: string
  fileContent: string
  patches: string
  diff: string
  file_diff: string
  commentChain: string
  comment: string
  custom_prompt: string
  related_files_content: string
  existing_tests_content: string
  all_files_content: string
  test_framework_info: string
  project_context: string

  constructor(config: InputsConfig | string = {}, ...legacyParams: any[]) {
    if (typeof config === 'string') {
      this.systemMessage = config
      this.title = legacyParams[0] || 'no title provided'
      this.description = legacyParams[1] || 'no description provided'
      this.rawSummary = legacyParams[2] || ''
      this.shortSummary = legacyParams[3] || ''
      this.filename = legacyParams[4] || ''
      this.fileContent = legacyParams[5] || 'file contents cannot be provided'
      this.patches = legacyParams[6] || ''
      this.diff = legacyParams[7] || 'no diff'
      this.file_diff = legacyParams[7] || 'no diff'
      this.commentChain = legacyParams[8] || 'no other comments on this patch'
      this.comment = legacyParams[9] || 'no comment provided'
      this.custom_prompt = legacyParams[10] || ''
      this.related_files_content = legacyParams[11] || 'no related files provided'
      this.existing_tests_content = legacyParams[12] || 'no existing tests found'
      this.all_files_content = legacyParams[13] || 'no files content provided'
      this.test_framework_info = legacyParams[14] || 'no test framework information provided'
      this.project_context = legacyParams[15] || 'no project context provided'
    } else {
      this.systemMessage = config.systemMessage || ''
      this.title = config.title || 'no title provided'
      this.description = config.description || 'no description provided'
      this.rawSummary = config.rawSummary || ''
      this.shortSummary = config.shortSummary || ''
      this.filename = config.filename || ''
      this.fileContent = config.fileContent || config.file_content || 'file contents cannot be provided'
      this.patches = config.patches || ''
      this.diff = config.diff || config.file_diff || 'no diff'
      this.file_diff = config.file_diff || 'no diff'
      this.commentChain = config.commentChain || ''
      this.comment = config.comment || 'no comment provided'
      this.custom_prompt = config.custom_prompt || ''
      this.related_files_content = config.related_files_content || 'no related files provided'
      this.existing_tests_content = config.existing_tests_content || 'no existing tests found'
      this.all_files_content = config.all_files_content || 'no files content provided'
      this.test_framework_info = config.test_framework_info || 'no test framework information provided'
      this.project_context = config.project_context || 'no project context provided'
    }
  }

  clone(): Inputs {
    return new Inputs({
      systemMessage: this.systemMessage,
      title: this.title,
      description: this.description,
      rawSummary: this.rawSummary,
      shortSummary: this.shortSummary,
      filename: this.filename,
      fileContent: this.fileContent,
      patches: this.patches,
      diff: this.diff,
      file_diff: this.file_diff,
      commentChain: this.commentChain,
      comment: this.comment,
      custom_prompt: this.custom_prompt,
      related_files_content: this.related_files_content,
      existing_tests_content: this.existing_tests_content,
      all_files_content: this.all_files_content,
      test_framework_info: this.test_framework_info,
      project_context: this.project_context
    })
  }

  render(content: string): string {
    if (!content) {
      return ''
    }
    
    // Use a more efficient approach with replace all
    const replacements: Record<string, string> = {
      '$system_message': this.systemMessage,
      '$title': this.title,
      '$description': this.description,
      '$raw_summary': this.rawSummary,
      '$short_summary': this.shortSummary,
      '$filename': this.filename,
      '$file_content': this.fileContent,
      '$patches': this.patches,
      '$diff': this.diff,
      '$file_diff': this.file_diff,
      '$comment_chain': this.commentChain,
      '$comment': this.comment,
      '$custom_prompt': this.custom_prompt,
      '$related_files_content': this.related_files_content,
      '$existing_tests_content': this.existing_tests_content,
      '$all_files_content': this.all_files_content,
      '$test_framework_info': this.test_framework_info,
      '$project_context': this.project_context
    }

    let result = content
    for (const [placeholder, value] of Object.entries(replacements)) {
      if (value) {
        result = result.replaceAll(placeholder, value)
      }
    }
    
    return result
  }
}
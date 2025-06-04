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
  commentChain: string
  comment: string

  constructor(config: InputsConfig | string = {}, ...legacyParams: any[]) {
    // Support pour l'ancien format (paramètres individuels)
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
      this.commentChain = legacyParams[8] || 'no other comments on this patch'
      this.comment = legacyParams[9] || 'no comment provided'
    } else {
      // Nouveau format (objet)
      this.systemMessage = config.systemMessage || ''
      this.title = config.title || 'no title provided'
      this.description = config.description || 'no description provided'
      this.rawSummary = config.rawSummary || ''
      this.shortSummary = config.shortSummary || ''
      this.filename = config.filename || ''
      this.fileContent = config.fileContent || config.file_content || 'file contents cannot be provided'
      this.patches = config.patches || ''
      this.diff = config.diff || config.file_diff || 'no diff'
      this.commentChain = config.commentChain || ''
      this.comment = config.comment || config.custom_prompt || 'no comment provided'
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
      commentChain: this.commentChain,
      comment: this.comment
    })
  }

  render(content: string): string {
    if (!content) {
      return ''
    }
    if (this.systemMessage) {
      content = content.replace('$system_message', this.systemMessage)
    }
    if (this.title) {
      content = content.replace('$title', this.title)
    }
    if (this.description) {
      content = content.replace('$description', this.description)
    }
    if (this.rawSummary) {
      content = content.replace('$raw_summary', this.rawSummary)
    }
    if (this.shortSummary) {
      content = content.replace('$short_summary', this.shortSummary)
    }
    if (this.filename) {
      content = content.replace('$filename', this.filename)
    }
    if (this.fileContent) {
      content = content.replace('$file_content', this.fileContent)
    }
    if (this.patches) {
      content = content.replace('$patches', this.patches)
    }
    if (this.diff) {
      content = content.replace('$diff', this.diff)
    }
    if (this.commentChain) {
      content = content.replace('$comment_chain', this.commentChain)
    }
    if (this.comment) {
      content = content.replace('$comment', this.comment)
    }
    return content
  }
}
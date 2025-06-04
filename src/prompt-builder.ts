// prompt-builder.ts
import {FilesInfo, FileData} from './related-files-finder'
import {Prompts} from './prompts'
import {Inputs} from './inputs'
import {octokit} from './octokit'
import {context as github_context} from '@actions/github'

export interface PromptContext {
  filename?: string
  customPrompt?: string
  filesInfo: FilesInfo | null
  filesDependencies: Map<string, FileData>
  prTitle?: string
  prDescription?: string
}

export interface PromptResult {
  prompt: string
  targetFiles: string[]
  context: string
}

export class PromptBuilder {
  private prompts: Prompts

  constructor(prompts: Prompts) {
    this.prompts = prompts
  }

  /**
   * Récupère les informations de la PR depuis GitHub
   */
  private async getPRInfo(): Promise<{title: string, description: string}> {
    try {
      const {data: pr} = await octokit.rest.pulls.get({
        owner: github_context.repo.owner,
        repo: github_context.repo.repo,
        pull_number: github_context.issue.number
      })
      
      return {
        title: pr.title || '',
        description: pr.body || ''
      }
    } catch (error) {
      console.warn('Failed to fetch PR info:', error)
      return {
        title: 'PR Analysis',
        description: 'Automated code analysis'
      }
    }
  }

  /**
   * Récupère le contenu d'un fichier depuis GitHub
   */
  private async getFileContent(filename: string): Promise<string> {
    try {
      const {data} = await octokit.rest.repos.getContent({
        owner: github_context.repo.owner,
        repo: github_context.repo.repo,
        path: filename,
        ref: github_context.payload.pull_request?.head?.sha
      })

      if ('content' in data && data.content) {
        return Buffer.from(data.content, 'base64').toString('utf-8')
      }
      return ''
    } catch (error) {
      console.warn(`Failed to fetch content for ${filename}:`, error)
      return ''
    }
  }

  /**
   * Récupère le diff d'un fichier depuis GitHub
   */
  private async getFileDiff(filename: string): Promise<string> {
    try {
      const {data} = await octokit.rest.pulls.listFiles({
        owner: github_context.repo.owner,
        repo: github_context.repo.repo,
        pull_number: github_context.issue.number,
      })

      // Extraire le diff pour le fichier spécifique
      const fileData = data.find(file => file.filename === filename)
      if (fileData && fileData.patch) {
        return fileData.patch
      }
    } catch (error) {
      console.warn(`Failed to fetch diff for ${filename}:`, error)
      return ''
    }
    return ''
  }

  /**
   * private async getFileDiff(filename: string): Promise<string> {
    try {
      const {data} = await octokit.rest.pulls.list({
        owner: github_context.repo.owner,
        repo: github_context.repo.repo,
        pull_number: github_context.issue.number,
        mediaType: {
          format: 'diff'
        }
      })

      // Extraire le diff pour le fichier spécifique
      const fullDiff = data as unknown as string
      const fileDiffRegex = new RegExp(`diff --git a/${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} b/${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=diff --git|$)`)
      const match = fullDiff.match(fileDiffRegex)
      
      return match ? match[0] : ''
    } catch (error) {
      console.warn(`Failed to fetch diff for ${filename}:`, error)
      return ''
    }
  }
    **/

  /**
   * Collecte les fichiers liés et leur contenu
   */
  private async getRelatedFilesContent(
    filename: string,
    filesDependencies: Map<string, FileData>
  ): Promise<string> {
    const relatedFiles: string[] = []
    
    // Obtenir les fichiers liés depuis les dépendances
    const fileData = filesDependencies.get(filename)
    if (fileData?.dependencies) {
      relatedFiles.push(...fileData.dependencies.map(dep => dep.path))
    }
    
    // Limiter à 5 fichiers pour éviter des prompts trop longs
    const limitedFiles = relatedFiles.slice(0, 5)
    
    const relatedContents = await Promise.all(
      limitedFiles.map(async (file) => {
        const content = await this.getFileContent(file)
        return `// File: ${file}\n${content}\n\n`
      })
    )
    
    return relatedContents.join('')
  }

  /**
   * Collecte les tests existants pour un fichier
   */
  private async getExistingTestsContent(filename: string, filesInfo: FilesInfo | null): Promise<string> {
    if (!filesInfo) return ''
    
    const modifiedFiles = filesInfo.getModifiedFilesData()
    const fileInfo = modifiedFiles.find(f => f.path === filename)
    
    if (!fileInfo || fileInfo.testFiles.length === 0) {
      return ''
    }
    
    const testContents = await Promise.all(
      fileInfo.testFiles.map(async (testFile) => {
        const content = await this.getFileContent(testFile)
        return `// Test file: ${testFile}\n${content}\n\n`
      })
    )
    
    return testContents.join('')
  }

  /**
   * Crée les inputs pour un fichier spécifique
   */
  private async createInputsForFile(
    filename: string,
    context: PromptContext
  ): Promise<Inputs> {
    const prInfo = await this.getPRInfo()
    const fileContent = await this.getFileContent(filename)
    const fileDiff = await this.getFileDiff(filename)
    const relatedFilesContent = await this.getRelatedFilesContent(filename, context.filesDependencies)
    const existingTestsContent = await this.getExistingTestsContent(filename, context.filesInfo)

    return new Inputs({
      title: context.prTitle || prInfo.title,
      description: context.prDescription || prInfo.description,
      filename: filename,
      file_content: fileContent,
      file_diff: fileDiff,
      related_files_content: relatedFilesContent,
      existing_tests_content: existingTestsContent,
      custom_prompt: context.customPrompt || ''
    })
  }

  /**
   * Crée les inputs pour tous les fichiers
   */
  private async createInputsForAllFiles(context: PromptContext): Promise<Inputs> {
    const prInfo = await this.getPRInfo()
    
    if (!context.filesInfo) {
      throw new Error('FilesInfo is required for all files operations')
    }

    const modifiedFiles = context.filesInfo.getModifiedFilesData()
    const allFileContents: string[] = []
    const allFileDiffs: string[] = []

    // Collecter le contenu et les diffs de tous les fichiers modifiés
    for (const file of modifiedFiles) {
      const content = await this.getFileContent(file.path)
      const diff = await this.getFileDiff(file.path)
      
      allFileContents.push(`// File: ${file.path}\n${content}\n\n`)
      allFileDiffs.push(`// Diff for: ${file.path}\n${diff}\n\n`)
    }

    return new Inputs({
      title: context.prTitle || prInfo.title,
      description: context.prDescription || prInfo.description,
      filename: 'all-files',
      file_content: allFileContents.join(''),
      file_diff: allFileDiffs.join(''),
      related_files_content: '',
      existing_tests_content: '',
      custom_prompt: context.customPrompt || ''
    })
  }

  /**
   * Génère un prompt pour résumer les changements d'un fichier
   */
  async buildSummarizeTestsPrompt(context: PromptContext): Promise<PromptResult> {
    if (!context.filename) {
      throw new Error('Filename is required for summarize tests')
    }

    const inputs = await this.createInputsForFile(context.filename, context)
    const prompt = this.prompts.renderSummarizeFileDiffForTest(inputs)

    return {
      prompt,
      targetFiles: [context.filename],
      context: `Summarizing test requirements for ${context.filename}`
    }
  }

  /**
   * Génère un prompt pour générer des tests pour un fichier
   */
  async buildGenerateTestsPrompt(context: PromptContext): Promise<PromptResult> {
    if (!context.filename) {
      throw new Error('Filename is required for generate tests')
    }

    const inputs = await this.createInputsForFile(context.filename, context)
    const prompt = this.prompts.renderGenerateTestsForFile(inputs)

    return {
      prompt,
      targetFiles: [context.filename],
      context: `Generating tests for ${context.filename}`
    }
  }

  /**
   * Génère un prompt pour générer des tests pour tous les fichiers
   */
  async buildGenerateAllTestsPrompt(context: PromptContext): Promise<PromptResult> {
    const inputs = await this.createInputsForAllFiles(context)
    const prompt = this.prompts.renderGenerateAllTests(inputs)
    
    const modifiedFiles = context.filesInfo?.getModifiedFilesData().map(f => f.path) || []

    return {
      prompt,
      targetFiles: modifiedFiles,
      context: `Generating tests for all modified files: ${modifiedFiles.join(', ')}`
    }
  }

  /**
   * Génère un prompt pour expliquer les tests d'un fichier
   */
  async buildExplainTestsPrompt(context: PromptContext): Promise<PromptResult> {
    if (!context.filename) {
      throw new Error('Filename is required for explain tests')
    }

    const inputs = await this.createInputsForFile(context.filename, context)
    const prompt = this.prompts.renderExplainTests(inputs)

    return {
      prompt,
      targetFiles: [context.filename],
      context: `Explaining test requirements for ${context.filename}`
    }
  }

  /**
   * Génère un prompt pour expliquer les tests de tous les fichiers
   */
  async buildExplainAllTestsPrompt(context: PromptContext): Promise<PromptResult> {
    const inputs = await this.createInputsForAllFiles(context)
    const prompt = this.prompts.renderExplainAllTests(inputs)
    
    const modifiedFiles = context.filesInfo?.getModifiedFilesData().map(f => f.path) || []

    return {
      prompt,
      targetFiles: modifiedFiles,
      context: `Explaining test requirements for all modified files: ${modifiedFiles.join(', ')}`
    }
  }

  /**
   * Génère un prompt pour la vérification de sécurité
   */
  async buildSecurityCheckPrompt(context: PromptContext): Promise<PromptResult> {
    if (!context.filename) {
      throw new Error('Filename is required for security check')
    }

    const inputs = await this.createInputsForFile(context.filename, context)
    const prompt = this.prompts.renderSecurityCheck(inputs)

    return {
      prompt,
      targetFiles: [context.filename],
      context: `Security analysis for ${context.filename}`
    }
  }

  /**
   * Génère un prompt personnalisé pour un fichier
   */
  async buildCustomPrompt(context: PromptContext): Promise<PromptResult> {
    if (!context.filename) {
      throw new Error('Filename is required for custom prompt')
    }
    if (!context.customPrompt) {
      throw new Error('Custom prompt is required for custom prompt command')
    }

    const inputs = await this.createInputsForFile(context.filename, context)
    const prompt = this.prompts.renderCustomPromptWithFiles(inputs)

    return {
      prompt,
      targetFiles: [context.filename],
      context: `Custom analysis for ${context.filename}: ${context.customPrompt}`
    }
  }

  /**
   * Génère un prompt personnalisé pour tous les fichiers
   */
  async buildCustomAllPrompt(context: PromptContext): Promise<PromptResult> {
    if (!context.customPrompt) {
      throw new Error('Custom prompt is required for custom all prompt command')
    }

    const inputs = await this.createInputsForAllFiles(context)
    const prompt = this.prompts.renderCustomPromptWithAll(inputs)
    
    const modifiedFiles = context.filesInfo?.getModifiedFilesData().map(f => f.path) || []

    return {
      prompt,
      targetFiles: modifiedFiles,
      context: `Custom analysis for all files: ${context.customPrompt}`
    }
  }

  /**
   * Factory method pour créer le bon prompt selon l'action
   */
  async buildPrompt(
    action: string,
    context: PromptContext
  ): Promise<PromptResult> {
    switch (action) {
      case 'summarize tests':
        return this.buildSummarizeTestsPrompt(context)
      
      case 'generate tests':
        return this.buildGenerateTestsPrompt(context)
      
      case 'all generate tests':
        return this.buildGenerateAllTestsPrompt(context)
      
      case 'explain tests':
        return this.buildExplainTestsPrompt(context)
      
      case 'all explain tests':
        return this.buildExplainAllTestsPrompt(context)
      
      case 'sec check':
        return this.buildSecurityCheckPrompt(context)
      
      case 'custom prompt':
        return this.buildCustomPrompt(context)
      
      case 'all custom prompt':
        return this.buildCustomAllPrompt(context)
      
      default:
        throw new Error(`Unknown action: ${action}`)
    }
  }
}
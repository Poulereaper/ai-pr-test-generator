import {warning, info} from '@actions/core'
import {context as github_context} from '@actions/github'
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types'
import type { Api } from '@octokit/plugin-rest-endpoint-methods/dist-types/types'
import type { PaginateInterface } from '@octokit/plugin-paginate-rest'
import * as path from 'path'
import * as parser from '@babel/parser'
import traverse from '@babel/traverse'

// Import the custom Octokit instance from octokit.ts
import {octokit } from './octokit'
import {Options} from './options'

// ========= Types for the Files Info Class ==========
type DependencyType = 'import' | 'require' | 'reference' | 'extends' | 'implements' | 'uses'

export interface FileDependency {
  path: string
  type: DependencyType
  rawImport?: string // Import original pour debug
}

export interface FileData {
  name: string         // File name
  path: string         // Full path of the file
  diff: string         // Diff content of the file
  content?: string     // Current content of the file (if available)
  dependencies: FileDependency[]  // Related files that this file depends on
  dependents: FileDependency[]    // Files that depend on this file
  testFiles: string[]  // Test files associated with this file
  isTest: boolean      // Whether this file is a test file
}

export class FilesInfo {
  private files: Map<string, FileData> = new Map()
  private allRepoFiles: Set<string> = new Set() // Cache de tous les fichiers du repo
  private readonly options: Options
  private readonly testPatterns: RegExp[] = [
    /\.test\.[jt]sx?$/,      // matches .test.js, .test.ts, .test.jsx, .test.tsx
    /\.spec\.[jt]sx?$/,      // matches .spec.js, .spec.ts, .spec.jsx, .spec.tsx
    /_test\.[jt]sx?$/,       // matches _test.js, _test.ts, etc.
    /Test\.java$/,           // matches Test.java
    /_test\.py$/,            // matches _test.py
    /test_.*\.py$/,          // matches test_*.py
    /.*_test\.go$/,          // matches *_test.go
    /.*_spec\.rb$/           // matches *_spec.rb
  ]

  constructor(options?: Options) {
    this.options = options || new Options(false, false)
  }

  /**
   * Processes files modified in the current PR to find related files and tests
   */
  public async processModifiedFiles(): Promise<void> {
    try {
      // D'abord, récupérer tous les fichiers du repository pour améliorer la résolution
      await this.loadRepositoryFiles()
      
      // Step 2: Get the files name and their full path in the PR
      const modifiedFiles = await this.getModifiedFiles()
      
      if (this.options.debug) {
        info(`Found ${modifiedFiles.length} modified files`)
        modifiedFiles.forEach(file => info(`  - ${file.path}`))
      }
      
      for (const file of modifiedFiles) {
        // Step 3: Get the diff of each file separately
        const diff = await this.getFileDiff(file.path)
        const content = await this.getFileContent(file.path)
        
        // Initialize file data
        const isTest = this.isTestFile(file.path)
        this.files.set(file.path, {
          name: path.basename(file.path),
          path: file.path,
          diff,
          content,
          dependencies: [],
          dependents: [],
          testFiles: [],
          isTest
        })
      }
      
      // Step 4: Get the related files (dependencies) and tests for each file
      await this.analyzeFiles()
      await this.findTestsForFiles()
      
      // Log the result if in debug mode
      if (this.options.debug) {
        info(`\n=== FILES ANALYSIS RESULTS ===`)
        for (const [filePath, fileData] of this.files.entries()) {
          info(`\nFile: ${filePath}`)
          info(`  Is Test: ${fileData.isTest}`)
          info(`  Dependencies (${fileData.dependencies.length}):`)
          fileData.dependencies.forEach(dep => 
            info(`    - ${dep.path} (${dep.type}) [${dep.rawImport || 'N/A'}]`)
          )
          info(`  Dependents (${fileData.dependents.length}):`)
          fileData.dependents.forEach(dep => 
            info(`    - ${dep.path} (${dep.type})`)
          )
          info(`  Test Files (${fileData.testFiles.length}):`)
          fileData.testFiles.forEach(test => info(`    - ${test}`))
        }
      }
    } catch (error) {
      warning(`Error processing modified files: ${error}`)
    }
  }

  /**
   * Load all files from the repository to improve path resolution
   */
  private async loadRepositoryFiles(): Promise<void> {
    try {
      if (this.options.debug) {
        info('Loading repository files for better path resolution...')
      }

      // Récupération récursive des fichiers via l'API GitHub
      const files = await this.getRepositoryFilesRecursive('')
      this.allRepoFiles = new Set(files)
      
      if (this.options.debug) {
        info(`Loaded ${this.allRepoFiles.size} files from repository`)
        if (this.allRepoFiles.size < 50) { // Afficher seulement si pas trop de fichiers
          Array.from(this.allRepoFiles).slice(0, 20).forEach(file => info(`  - ${file}`))
          if (this.allRepoFiles.size > 20) {
            info(`  ... and ${this.allRepoFiles.size - 20} more files`)
          }
        }
      }
    } catch (error) {
      warning(`Error loading repository files: ${error}`)
    }
  }

  /**
   * Recursively get all files from the repository
   */
  private async getRepositoryFilesRecursive(dirPath: string): Promise<string[]> {
    const files: string[] = []
    
    try {
      const {data} = await octokit.rest.repos.getContent({
        owner: github_context.repo.owner,
        repo: github_context.repo.repo,
        path: dirPath,
        ref: github_context.payload.pull_request?.head.sha
      })

      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.type === 'file') {
            files.push(item.path)
          } else if (item.type === 'dir') {
            // Récursion pour les dossiers, mais limiter la profondeur
            if (this.shouldTraverseDirectory(item.path)) {
              const subFiles = await this.getRepositoryFilesRecursive(item.path)
              files.push(...subFiles)
            }
          }
        }
      }
    } catch (error) {
      if (this.options.debug) {
        warning(`Error reading directory ${dirPath}: ${error}`)
      }
    }

    return files
  }

  /**
   * Determine if we should traverse into a directory (avoid node_modules, etc.)
   */
  private shouldTraverseDirectory(dirPath: string): boolean {
    const skipDirs = [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '.next',
      '.nuxt',
      'vendor',
      '__pycache__',
      '.pytest_cache',
      'target', // Java
      'bin',
      'obj'
    ]
    
    const dirName = path.basename(dirPath)
    return !skipDirs.includes(dirName) && !dirName.startsWith('.')
  }

  /**
   * Get all files that were modified in the current PR
   */
  private async getModifiedFiles(): Promise<{path: string}[]> {
    try {
      const {data: filesData} = await octokit.rest.pulls.listFiles({
        owner: github_context.repo.owner,
        repo: github_context.repo.repo,
        pull_number: github_context.issue.number
      })

      return filesData.map((file: { filename: string }) => ({ path: file.filename }))
    } catch (error) {
      warning(`Error fetching modified files: ${error}`)
      return []
    }
  }

  /**
   * Get the diff for a specific file in the current PR
   */
  private async getFileDiff(filePath: string): Promise<string> {
    try {
      const {data: filesData} = await octokit.rest.pulls.listFiles({
        owner: github_context.repo.owner,
        repo: github_context.repo.repo,
        pull_number: github_context.issue.number
      })

      const fileData = filesData.find((file: { filename: string }) => file.filename === filePath)
      return fileData?.patch || ''
    } catch (error) {
      warning(`Error fetching diff for ${filePath}: ${error}`)
      return ''
    }
  }

  /**
   * Get the content of a file from the repository
   */
  private async getFileContent(filePath: string): Promise<string | undefined> {
    try {
      const {data} = await octokit.rest.repos.getContent({
        owner: github_context.repo.owner,
        repo: github_context.repo.repo,
        path: filePath,
        ref: github_context.payload.pull_request?.head.sha
      })

      // @ts-ignore - We know data will have content when path points to a file
      if (data.content && data.encoding === 'base64') {
        // @ts-ignore
        return Buffer.from(data.content, 'base64').toString('utf8')
      }
      return undefined
    } catch (error) {
      warning(`Error fetching content for ${filePath}: ${error}`)
      return undefined
    }
  }

  /**
   * Analyze files to extract dependencies based on language-specific patterns
   */
  private async analyzeFiles(): Promise<void> {
    for (const [filePath, fileData] of this.files.entries()) {
      if (!fileData.content) continue
      
      if (this.options.debug) {
        info(`Analyzing dependencies for: ${filePath}`)
      }
      
      const dependencies = this.extractDependencies(filePath, fileData.content)
      fileData.dependencies = dependencies
      
      if (this.options.debug && dependencies.length > 0) {
        info(`  Found ${dependencies.length} dependencies:`)
        dependencies.forEach(dep => info(`    - ${dep.rawImport} -> ${dep.path}`))
      }
      
      // Update dependents for each dependency
      for (const dep of dependencies) {
        const depFile = this.files.get(dep.path)
        if (depFile) {
          depFile.dependents.push({
            path: filePath,
            type: dep.type,
            rawImport: dep.rawImport
          })
        }
      }
    }
  }

  /**
   * Extract dependencies from file content based on language
   */
  private extractDependencies(filePath: string, content: string): FileDependency[] {
    const ext = path.extname(filePath).toLowerCase()
    const dependencies: FileDependency[] = []

    try {
      switch (ext) {
        case '.js':
        case '.jsx':
        case '.ts':
        case '.tsx':
          this.extractJavaScriptDependencies(filePath, content, dependencies)
          break
        case '.py':
          this.extractPythonDependencies(filePath, content, dependencies)
          break
        case '.java':
          this.extractJavaDependencies(filePath, content, dependencies)
          break
        case '.go':
          this.extractGoDependencies(filePath, content, dependencies)
          break
        default:
          this.extractGenericDependencies(filePath, content, dependencies)
      }
    } catch (error) {
      warning(`Error extracting dependencies from ${filePath}: ${error}`)
    }

    return dependencies
  }

  /**
   * Extract dependencies from JavaScript/TypeScript files
   */
  private extractJavaScriptDependencies(filePath: string, content: string, dependencies: FileDependency[]): void {
    try {
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy'],
        errorRecovery: true
      })

      traverse(ast, {
        ImportDeclaration: (nodePath) => {
          const source = nodePath.node.source.value
          if (typeof source === 'string') {
            const resolvedPath = this.resolveRelativePath(filePath, source)
            if (resolvedPath) {
              dependencies.push({
                path: resolvedPath,
                type: 'import',
                rawImport: source
              })
            }
          }
        },
        CallExpression: (nodePath) => {
          // Check for require() calls
          if (nodePath.node.callee.type === 'Identifier' && 
              nodePath.node.callee.name === 'require' &&
              nodePath.node.arguments.length > 0 &&
              nodePath.node.arguments[0].type === 'StringLiteral') {
            
            const source = nodePath.node.arguments[0].value
            const resolvedPath = this.resolveRelativePath(filePath, source)
            if (resolvedPath) {
              dependencies.push({
                path: resolvedPath,
                type: 'require',
                rawImport: source
              })
            }
          }
        }
      })

      // Fallback: regex pour attraper les imports qui n'ont pas été parsés
      this.extractJavaScriptDependenciesRegex(filePath, content, dependencies)
      
    } catch (error) {
      warning(`Error parsing JavaScript/TypeScript AST for ${filePath}: ${error}`)
      // Fallback to regex parsing
      this.extractJavaScriptDependenciesRegex(filePath, content, dependencies)
    }
  }

  /**
   * Regex fallback for JavaScript/TypeScript imports
   */
  private extractJavaScriptDependenciesRegex(filePath: string, content: string, dependencies: FileDependency[]): void {
    // Import statements
    const importRegex = /^\s*import\s+(?:(?:\w+,?\s*)?(?:\{[^}]*\})?(?:\w+)?\s+from\s+)?['"]([^'"]+)['"]/gm
    // Require statements
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    // Dynamic imports
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

    const regexes = [
      { regex: importRegex, type: 'import' as DependencyType },
      { regex: requireRegex, type: 'require' as DependencyType },
      { regex: dynamicImportRegex, type: 'import' as DependencyType }
    ]

    for (const { regex, type } of regexes) {
      let match
      while ((match = regex.exec(content)) !== null) {
        const source = match[1]
        const resolvedPath = this.resolveRelativePath(filePath, source)
        if (resolvedPath && !dependencies.some(d => d.path === resolvedPath)) {
          dependencies.push({
            path: resolvedPath,
            type,
            rawImport: source
          })
        }
      }
    }
  }

  /**
   * Improved relative path resolution using repository file cache
   */
  private resolveRelativePath(fromFile: string, importPath: string): string | null {
    // Skip external packages (not starting with . or /)
    if (!importPath.startsWith('./') && !importPath.startsWith('../') && !importPath.startsWith('/')) {
      return null
    }

    const fromDir = path.dirname(fromFile)
    
    // Résoudre le chemin relatif
    let resolvedPath: string
    if (importPath.startsWith('/')) {
      // Chemin absolu depuis la racine
      resolvedPath = importPath.substring(1)
    } else {
      // Chemin relatif
      resolvedPath = path.join(fromDir, importPath)
    }

    // Normaliser le chemin (enlever ./ et ../)
    resolvedPath = path.normalize(resolvedPath)

    // Vérifier le chemin exact d'abord
    const exactMatch = this.findFileInCurrentAndParentDirs(resolvedPath)
    if (exactMatch) {
      return exactMatch
    }

    // Si pas trouvé exactement, essayer avec des extensions
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.json', '.py', '.java', '.go', '.rb']
    
    for (const ext of extensions) {
      const pathWithExt = resolvedPath + ext
      const matchWithExt = this.findFileInCurrentAndParentDirs(pathWithExt)
      if (matchWithExt) {
        return matchWithExt
      }
    }

    // Essayer avec index files
    const indexFiles = ['/index.js', '/index.jsx', '/index.ts', '/index.tsx']
    for (const indexFile of indexFiles) {
      const indexPath = resolvedPath + indexFile
      const matchWithIndex = this.findFileInCurrentAndParentDirs(indexPath)
      if (matchWithIndex) {
        return matchWithIndex
      }
    }

    // Si rien n'est trouvé, chercher des fichiers similaires
    const similarFiles = Array.from(this.allRepoFiles).filter(file => {
      const basename = path.basename(resolvedPath)
      return file.includes(basename) || path.basename(file, path.extname(file)) === basename
    })

    if (similarFiles.length > 0) {
      if (this.options.debug) {
        info(`Could not resolve ${importPath} from ${fromFile}, similar files found: ${similarFiles.join(', ')}`)
      }
      // Retourner le premier fichier similaire trouvé
      return similarFiles[0]
    }

    if (this.options.debug) {
      info(`Could not resolve import: ${importPath} from ${fromFile} -> ${resolvedPath}`)
    }

    return null
  }

  private findFileInCurrentAndParentDirs(targetPath: string): string | null {
    // D'abord, essayer le chemin exact
    if (this.allRepoFiles.has(targetPath)) {
      return targetPath
    }

    // Ensuite, chercher dans les dossiers parents (jusqu'à 3 niveaux)
    const maxParentLevels = 3
    const baseName = path.basename(targetPath)
    
    for (let level = 1; level <= maxParentLevels; level++) {
      // Générer les chemins possibles à ce niveau parent
      const possiblePaths = this.generateParentLevelPaths(targetPath, level)
      
      for (const possiblePath of possiblePaths) {
        if (this.allRepoFiles.has(possiblePath)) {
          if (this.options.debug) {
            info(`Found file in parent directory (level ${level}): ${possiblePath}`)
          }
          return possiblePath
        }
      }
    }

    return null
  }

  private generateParentLevelPaths(originalPath: string, parentLevel: number): string[] {
    const possiblePaths: string[] = []
    const fileName = path.basename(originalPath)
    const originalDir = path.dirname(originalPath)
    
    // Monter d'un niveau à la fois
    let currentDir = originalDir
    for (let i = 0; i < parentLevel; i++) {
      currentDir = path.dirname(currentDir)
      if (currentDir === '.' || currentDir === '/') {
        break
      }
    }

    // Générer différentes combinaisons de chemins possibles
    const commonSubDirs = ['src', 'lib', 'utils', 'components', 'services', 'helpers', 'core', 'common', 'shared']
    
    // Chemin direct dans le dossier parent
    possiblePaths.push(path.join(currentDir, fileName))
    
    // Chercher dans les sous-dossiers communs du dossier parent
    for (const subDir of commonSubDirs) {
      possiblePaths.push(path.join(currentDir, subDir, fileName))
    }

    return possiblePaths.filter(p => p !== originalPath) // Éviter les doublons
  }

  /**
   * Extract dependencies from Python files
   */
  private extractPythonDependencies(filePath: string, content: string, dependencies: FileDependency[]): void {
    // Match import statements: import foo, from foo import bar
    const importRegex = /^\s*(from\s+([.\w]+)\s+import|import\s+([.\w, ]+))/gm
    let match
    
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = (match[2] || match[3]).trim()
      if (importPath.startsWith('.')) {
        // Only add relative imports as dependencies
        const modulePath = this.resolvePythonModulePath(filePath, importPath)
        if (modulePath) {
          dependencies.push({
            path: modulePath,
            type: 'import',
            rawImport: importPath
          })
        }
      }
    }
  }

  /**
   * Extract dependencies from Java files
   */
  private extractJavaDependencies(filePath: string, content: string, dependencies: FileDependency[]): void {
    // Match import statements
    const importRegex = /^\s*import\s+([^;]+);/gm
    let match
    
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1].trim()
      // Convert Java package notation to file path
      const javaFilePath = this.resolveJavaPath(filePath, importPath)
      if (javaFilePath) {
        dependencies.push({
          path: javaFilePath,
          type: 'import',
          rawImport: importPath
        })
      }
    }
  }

  /**
   * Extract dependencies from Go files
   */
  private extractGoDependencies(filePath: string, content: string, dependencies: FileDependency[]): void {
    // Match import statements
    const importRegex = /^\s*import\s+\(\s*((?:.|\n)*?)\s*\)/gm
    const singleImportRegex = /^\s*import\s+"([^"]+)"/gm
    
    // Parse multi-line imports
    let match
    while ((match = importRegex.exec(content)) !== null) {
      const importBlock = match[1]
      const importLineRegex = /"([^"]+)"/g
      let importMatch
      
      while ((importMatch = importLineRegex.exec(importBlock)) !== null) {
        const importPath = importMatch[1].trim()
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
          const resolvedPath = this.resolveRelativePath(filePath, importPath)
          if (resolvedPath) {
            dependencies.push({
              path: resolvedPath,
              type: 'import',
              rawImport: importPath
            })
          }
        }
      }
    }
    
    // Parse single-line imports
    while ((match = singleImportRegex.exec(content)) !== null) {
      const importPath = match[1].trim()
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        const resolvedPath = this.resolveRelativePath(filePath, importPath)
        if (resolvedPath) {
          dependencies.push({
            path: resolvedPath,
            type: 'import',
            rawImport: importPath
          })
        }
      }
    }
  }

  /**
   * Extract dependencies using generic regex patterns for other file types
   */
  private extractGenericDependencies(filePath: string, content: string, dependencies: FileDependency[]): void {
    // Look for patterns like include, require, import with relative paths
    const genericRegex = /(?:include|require|import|from)\s+['"]([.\/][^'"]+)['"]/g
    let match
    
    while ((match = genericRegex.exec(content)) !== null) {
      const importPath = match[1].trim()
      const resolvedPath = this.resolveRelativePath(filePath, importPath)
      
      if (resolvedPath) {
        dependencies.push({
          path: resolvedPath,
          type: 'reference',
          rawImport: importPath
        })
      }
    }
  }

  /**
   * Find test files that are related to the source files
   */
  private async findTestsForFiles(): Promise<void> {
    for (const [filePath, fileData] of this.files.entries()) {
      if (fileData.isTest) continue // Skip test files themselves
      
      // First matching by naming conventions
      const testsByNaming = this.findTestsByNamingConvention(filePath)
      
      // Then by import analysis - test files that import this file
      const testsByImport = this.findTestsByImport(filePath)
      
      // Combine results
      fileData.testFiles = [...new Set([...testsByNaming, ...testsByImport])]
    }
  }

  /**
   * Find test files based on naming conventions
   */
  private findTestsByNamingConvention(filePath: string): string[] {
    const dir = path.dirname(filePath)
    const baseName = path.basename(filePath, path.extname(filePath))
    const ext = path.extname(filePath)
    
    const testFiles: string[] = []
    
    // Recherche dans le répertoire courant et les dossiers parents (jusqu'à 3 niveaux)
    for (let level = 0; level <= 3; level++) {
      let searchDir = dir
      
      // Monter dans l'arborescence
      for (let i = 0; i < level; i++) {
        searchDir = path.dirname(searchDir)
        if (searchDir === '.' || searchDir === '/') {
          break
        }
      }
      
      // Patterns de test possibles à ce niveau
      const possibleTestPaths = [
        // Dans le répertoire direct
        path.join(searchDir, `${baseName}.test${ext}`),
        path.join(searchDir, `${baseName}.spec${ext}`),
        path.join(searchDir, `${baseName}_test${ext}`),
        path.join(searchDir, `test_${baseName}${ext}`),
        
        // Dans des sous-dossiers de test
        path.join(searchDir, '__tests__', `${baseName}.test${ext}`),
        path.join(searchDir, '__tests__', `${baseName}.spec${ext}`),
        path.join(searchDir, 'tests', `${baseName}.test${ext}`),
        path.join(searchDir, 'tests', `${baseName}.spec${ext}`),
        path.join(searchDir, 'test', `${baseName}.test${ext}`),
        path.join(searchDir, 'test', `${baseName}.spec${ext}`),
        
        // Patterns spécifiques selon les langages
        ...(ext === '.py' ? [
          path.join(searchDir, `test_${baseName}.py`),
          path.join(searchDir, 'tests', `test_${baseName}.py`)
        ] : []),
        ...(ext === '.java' ? [
          path.join(searchDir, `${baseName}Test.java`),
          path.join(searchDir, 'test', 'java', searchDir.replace('src/main/java/', ''), `${baseName}Test.java`)
        ] : []),
        ...(ext === '.go' ? [
          path.join(searchDir, `${baseName}_test.go`)
        ] : [])
      ]
      
      // Filtrer les chemins qui existent
      const existingTests = possibleTestPaths.filter(testPath => 
        this.files.has(testPath) || this.allRepoFiles.has(testPath)
      )
      
      testFiles.push(...existingTests)
      
      if (this.options.debug && existingTests.length > 0) {
        info(`Found ${existingTests.length} test files at parent level ${level} for ${filePath}:`)
        existingTests.forEach(test => info(`  - ${test}`))
      }
    }
    
    // Retourner les chemins uniques
    return [...new Set(testFiles)]
  }

  /**
   * Find test files that import/require the source file
   */
  private findTestsByImport(filePath: string): string[] {
    const testsByImport: string[] = []
    
    for (const [testPath, testData] of this.files.entries()) {
      if (!testData.isTest) continue
      
      // Check if this test file imports/requires the source file
      if (testData.dependencies.some(dep => dep.path === filePath)) {
        testsByImport.push(testPath)
      }
    }
    
    return testsByImport
  }

  /**
   * Resolve Python relative imports to file paths
   */
  private resolvePythonModulePath(filePath: string, importPath: string): string | null {
    const dir = path.dirname(filePath)
    let targetPath = dir
    
    // Handle relative imports (.foo, ..foo, etc.)
    const dotCount = importPath.match(/^\.+/)?.[0].length || 0
    if (dotCount > 0) {
      for (let i = 0; i < dotCount - 1; i++) {
        targetPath = path.dirname(targetPath)
      }
      importPath = importPath.substring(dotCount)
    }
    
    // Convert module path to file path
    const modulePath = importPath.replace(/\./g, path.sep)
    const resolvedPath = path.join(targetPath, modulePath)
    
    // Try with .py extension
    const pyFile = `${resolvedPath}.py`
    if (this.allRepoFiles.has(pyFile)) {
      return pyFile
    }
    
    // Try as a directory with __init__.py
    const initFile = path.join(resolvedPath, '__init__.py')
    if (this.allRepoFiles.has(initFile)) {
      return initFile
    }
    
    return null
  }

  /**
   * Resolve Java package imports to file paths
   */
  private resolveJavaPath(filePath: string, importPath: string): string | null {
    // Only handle relative imports in the same project
    if (!importPath.includes('.')) {
      return null
    }
    
    // Convert Java package notation to file path
    const javaFilePath = importPath.replace(/\./g, path.sep) + '.java'
    
    // Try different common Java project structures
    const possiblePaths = [
      javaFilePath,
      path.join('src', 'main', 'java', javaFilePath),
      path.join('src', javaFilePath)
    ]
    
    for (const possiblePath of possiblePaths) {
      if (this.allRepoFiles.has(possiblePath)) {
        return possiblePath
      }
    }
    
    return null
  }

  /**
   * Checks if a file is a test file based on common naming patterns
   */
  private isTestFile(filePath: string): boolean {
    return this.testPatterns.some(pattern => pattern.test(filePath))
  }

  /**
   * Get all files that were processed
   */
  public getAllFiles(): Map<string, FileData> {
    return this.files
  }

  /**
   * Get a specific file by path
   */
  public getFile(filePath: string): FileData | undefined {
    return this.files.get(filePath)
  }

  /**
   * Get all modified files
   */
  public getModifiedFilesData(): FileData[] {
    return Array.from(this.files.values())
  }

  /**
   * Get all test files that need to be modified based on source file changes
   */
  public getTestsToModify(): string[] {
    const testsToModify = new Set<string>()
    
    for (const fileData of this.files.values()) {
      if (!fileData.isTest) {
        // Add all related test files
        fileData.testFiles.forEach(test => testsToModify.add(test))
      }
    }
    
    return Array.from(testsToModify)
  }
}
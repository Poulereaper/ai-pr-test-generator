
import {warning, info} from '@actions/core'
import {context as github_context} from '@actions/github'
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types'
import type { Api } from '@octokit/plugin-rest-endpoint-methods/dist-types/types'
import type { PaginateInterface } from '@octokit/plugin-paginate-rest'
//import type {NodePath} from '@babel/traverse'
import * as fs from 'fs'
import * as path from 'path'
import * as parser from '@babel/parser'
import traverse from '@babel/traverse'

// Import the custom Octokit instance from octokit.ts
import {octokit } from './octokit'
import {Options} from './options'

// eslint-disable-next-line camelcase
//const context = github_context
//const repo = context.repo


// ========= Types for the Files Info Class ==========
type DependencyType = 'import' | 'require' | 'reference' | 'extends' | 'implements' | 'uses'

export interface FileDependency {
  path: string
  type: DependencyType
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

// ========= Files Info Class ==========
// This class is used to store information about files that as been modified in the PR, it contains :
// the file name, the diff of the file, the related files and the related tests

// No Input, will use the context from github or if needed the inputs from the action
// Output will be the class with the information about the files

//Step 1: Create a class to store the file information
// Step 2: get the files name and there full path in the PR
// Step 3: get the diff of each file separately
// Step 4: get the related files (dependancies) and tests for each file
// Step 5: store the information for each files in the class 

export class FilesInfo {
  private files: Map<string, FileData> = new Map()
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
    this.options = options || new Options(false, false) //If no options are provided, use default options
  }

  /**
   * Processes files modified in the current PR to find related files and tests
   */
  public async processModifiedFiles(diff_file: { filename: string }[]): Promise<void> {
    try {
      // Step 2: Get the files name and their full path in the PR
      const modifiedFiles = diff_file.map((file: { filename: string }) => ({ path: file.filename }))
      
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
        info(`Files info: ${JSON.stringify(Array.from(this.files.entries()), null, 2)}`)
      }
    } catch (error) {
      warning(`Error processing modified files: ${error}`)
    }
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
      
      const dependencies = this.extractDependencies(filePath, fileData.content)
      fileData.dependencies = dependencies
      
      // Update dependents for each dependency
      for (const dep of dependencies) {
        const depFile = this.files.get(dep.path)
        if (depFile) {
          depFile.dependents.push({
            path: filePath,
            type: dep.type
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
          // Parse JavaScript/TypeScript for imports and requires
          this.extractJavaScriptDependencies(filePath, content, dependencies)
          break;
        case '.py':
          // Parse Python imports
          this.extractPythonDependencies(filePath, content, dependencies)
          break;
        case '.java':
          // Parse Java imports
          this.extractJavaDependencies(filePath, content, dependencies)
          break;
        case '.go':
          // Parse Go imports
          this.extractGoDependencies(filePath, content, dependencies)
          break;
        default:
          // For other file types, use simple regex patterns
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
      })

      traverse(ast, {
        ImportDeclaration(nodePath) {
          const source = nodePath.node.source.value
          if (typeof source === 'string' && !source.startsWith('.')) return
          
          const importPath = resolveRelativePath(filePath, source)
          dependencies.push({
            path: importPath,
            type: 'import'
          })
        },
        CallExpression(nodePath) {
          // Check for require() calls
          if (nodePath.node.callee.type === 'Identifier' && 
              nodePath.node.callee.name === 'require' &&
              nodePath.node.arguments.length > 0 &&
              nodePath.node.arguments[0].type === 'StringLiteral') {
            
            const source = nodePath.node.arguments[0].value
            if (!source.startsWith('.')) return
            
            const requirePath = resolveRelativePath(filePath, source)
            dependencies.push({
              path: requirePath,
              type: 'require'
            })
          }
        }
      })
    } catch (error) {
      warning(`Error parsing JavaScript/TypeScript file ${filePath}: ${error}`)
    }

    // Helper function to resolve relative paths
    function resolveRelativePath(from: string, to: string): string {
      const dir = path.dirname(from)
      let resolved = path.resolve(dir, to)
      
      // Handle explicit extensions
      if (path.extname(to) !== '') {
        return resolved
      }
      
      // Try common extensions
      const extensions = ['.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.ts']
      for (const ext of extensions) {
        if (fs.existsSync(resolved + ext)) {
          return resolved + ext
        }
      }
      
      return resolved
    }
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
            type: 'import'
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
          type: 'import'
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
          dependencies.push({
            path: this.resolveGoPath(filePath, importPath),
            type: 'import'
          })
        }
      }
    }
    
    // Parse single-line imports
    while ((match = singleImportRegex.exec(content)) !== null) {
      const importPath = match[1].trim()
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        dependencies.push({
          path: this.resolveGoPath(filePath, importPath),
          type: 'import'
        })
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
      const resolvedPath = path.resolve(path.dirname(filePath), importPath)
      
      dependencies.push({
        path: resolvedPath,
        type: 'reference'
      })
    }
  }

  /**
   * Find test files that are related to the source files
   */
  private async findTestsForFiles(): Promise<void> {
    for (const [filePath, fileData] of this.files.entries()) {
      if (fileData.isTest) continue; // Skip test files themselves
      
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
    
    // Common test file patterns based on the source file name
    const possibleTestPaths = [
      path.join(dir, `${baseName}.test${ext}`),
      path.join(dir, `${baseName}.spec${ext}`),
      path.join(dir, `${baseName}_test${ext}`),
      path.join(dir, `test_${baseName}${ext}`),
      path.join(dir, '__tests__', `${baseName}.test${ext}`),
      path.join(dir, '__tests__', `${baseName}.spec${ext}`),
      path.join(dir, 'tests', `${baseName}.test${ext}`),
      path.join(dir, 'tests', `${baseName}.spec${ext}`),
      path.join(dir, '..', 'tests', `${baseName}.test${ext}`),
      path.join(dir, '..', 'tests', `${baseName}.spec${ext}`)
    ]
    
    // Return paths that match files we've seen in the PR
    return possibleTestPaths.filter(testPath => this.files.has(testPath))
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
    if (this.files.has(pyFile)) {
      return pyFile
    }
    
    // Try as a directory with __init__.py
    const initFile = path.join(resolvedPath, '__init__.py')
    if (this.files.has(initFile)) {
      return initFile
    }
    
    return null
  }

  /**
   * Resolve Java package imports to file paths
   */
  private resolveJavaPath(filePath: string, importPath: string): string | null {
    // Only handle relative imports in the same project
    if (!importPath.startsWith('.')) {
      return null
    }
    
    const projectRoot = this.findProjectRoot(filePath)
    if (!projectRoot) return null
    
    // Convert Java package notation to file path
    const javaFilePath = importPath.replace(/\./g, path.sep) + '.java'
    const resolvedPath = path.join(projectRoot, 'src', 'main', 'java', javaFilePath)
    
    return this.files.has(resolvedPath) ? resolvedPath : null
  }

  /**
   * Resolve Go imports to file paths
   */
  private resolveGoPath(filePath: string, importPath: string): string {
    const dir = path.dirname(filePath)
    const resolvedPath = path.resolve(dir, importPath)
    
    // Try with .go extension if not present
    if (!resolvedPath.endsWith('.go')) {
      return `${resolvedPath}.go`
    }
    
    return resolvedPath
  }

  /**
   * Find the project root directory by looking for common markers
   */
  private findProjectRoot(filePath: string): string | null {
    let currentDir = path.dirname(filePath)
    const maxDepth = 10
    let depth = 0
    
    while (depth < maxDepth) {
      // Check for common project root indicators
      if (fs.existsSync(path.join(currentDir, 'pom.xml')) ||
          fs.existsSync(path.join(currentDir, 'build.gradle')) ||
          fs.existsSync(path.join(currentDir, '.git')) ||
          fs.existsSync(path.join(currentDir, 'package.json'))) {
        return currentDir
      }
      
      const parentDir = path.dirname(currentDir)
      if (parentDir === currentDir) {
        // We've reached the root directory
        break
      }
      
      currentDir = parentDir
      depth++
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
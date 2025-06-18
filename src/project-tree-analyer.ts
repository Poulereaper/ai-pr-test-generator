import * as fs from 'fs'
import * as path from 'path'
import { PathFilter } from './options' // Ajustez le chemin selon votre structure

export interface TreeNode {
  name: string
  type: 'file' | 'directory'
  children?: TreeNode[]
  path: string
}

export class TreeGenerator {
  private pathFilter: PathFilter
  private rootPath: string
  private debug: boolean

  constructor(pathFilter: PathFilter, debug: boolean = false) {
    // Dans GitHub Actions, le workspace est défini par GITHUB_WORKSPACE
    this.rootPath = process.env.GITHUB_WORKSPACE || process.cwd()
    this.pathFilter = pathFilter
    this.debug = debug
    
    if (this.debug) {
      console.log(`TreeGenerator initialized with rootPath: ${this.rootPath}`)
      console.log(`Current working directory: ${process.cwd()}`)
      console.log(`GITHUB_WORKSPACE: ${process.env.GITHUB_WORKSPACE}`)
    }
  }

  /**
   * Vérifie si le répertoire racine existe et est accessible
   */
  private validateRootPath(): boolean {
    try {
      const stats = fs.statSync(this.rootPath)
      if (!stats.isDirectory()) {
        console.error(`Root path is not a directory: ${this.rootPath}`)
        return false
      }
      
      // Test de lecture
      fs.readdirSync(this.rootPath)
      
      if (this.debug) {
        console.log(`Root path validation successful: ${this.rootPath}`)
      }
      return true
    } catch (error) {
      console.error(`Root path validation failed: ${this.rootPath}`, error)
      return false
    }
  }

  /**
   * Liste le contenu du répertoire racine pour debugging
   */
  private debugRootContent(): void {
    if (!this.debug) return
    
    try {
      const entries = fs.readdirSync(this.rootPath, { withFileTypes: true })
      console.log(`Root directory contains ${entries.length} entries:`)
      entries.forEach(entry => {
        console.log(`  ${entry.isDirectory() ? 'DIR' : 'FILE'}: ${entry.name}`)
      })
    } catch (error) {
      console.error('Failed to list root directory content:', error)
    }
  }

  /**
   * Lit récursivement la structure du répertoire
   */
  private readDirectoryStructure(dirPath: string, relativePath: string = ''): TreeNode[] {
    const nodes: TreeNode[] = []

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })

      if (this.debug && relativePath === '') {
        console.log(`Processing root directory with ${entries.length} entries`)
      }

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name

        // Ignore les fichiers/dossiers .git mais pas .github (pour les actions)
        if (entry.name === '.git') {
          if (this.debug) {
            console.log(`Skipping .git directory`)
          }
          continue
        }

        // Test du PathFilter
        const shouldInclude = this.pathFilter.check(entryRelativePath)
        if (this.debug && !shouldInclude) {
          console.log(`PathFilter excluded: ${entryRelativePath}`)
        }
        
        if (!shouldInclude) {
          continue
        }

        const node: TreeNode = {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          path: entryRelativePath
        }

        if (entry.isDirectory()) {
          const children = this.readDirectoryStructure(fullPath, entryRelativePath)
          if (children.length > 0) {
            node.children = children
          }
          // Inclure les répertoires même s'ils sont vides pour la structure
          else if (this.debug) {
            console.log(`Empty directory: ${entryRelativePath}`)
          }
        }

        nodes.push(node)
      }
    } catch (error) {
      console.error(`Impossible de lire le répertoire ${dirPath}:`, error)
    }

    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  }

  /**
   * Génère l'arborescence avec connecteurs visuels
   */
  private treeNodesToString(nodes: TreeNode[], indent: string = ''): string {
    let result = ''

    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1
      const connector = isLast ? '└── ' : '├── '
      const name = node.type === 'directory' ? `${node.name}/` : node.name

      result += `${indent}${connector}${name}\n`

      if (node.children && node.children.length > 0) {
        const childIndent = indent + (isLast ? '    ' : '│   ')
        result += this.treeNodesToString(node.children, childIndent)
      }
    })

    return result
  }

  /**
   * Génère l'arborescence simplifiée avec indentation
   */
  private treeNodesToSimpleString(nodes: TreeNode[], indent: string = ''): string {
    let result = ''

    for (const node of nodes) {
      const name = node.type === 'directory' ? `${node.name}/` : node.name
      result += `${indent}${name}\n`

      if (node.children && node.children.length > 0) {
        result += this.treeNodesToSimpleString(node.children, indent + '  ')
      }
    }

    return result
  }

  /**
   * Test du PathFilter pour debugging
   */
  private testPathFilter(): void {
    if (!this.debug) return
    
    console.log('\n=== PathFilter Test ===')
    const testPaths = [
      'src/main.ts',
      'dist/bundle.js',
      'package.json',
      'node_modules/some-package',
      'README.md',
      '.github/workflows/ci.yml'
    ]
    
    testPaths.forEach(testPath => {
      const result = this.pathFilter.check(testPath)
      console.log(`PathFilter.check("${testPath}") = ${result}`)
    })
    console.log('=== End PathFilter Test ===\n')
  }

  /**
   * Génère l'arborescence complète avec connecteurs
   */
  public generateTree(): string {
    if (this.debug) {
      console.log('\n=== TreeGenerator Debug Info ===')
      this.debugRootContent()
      this.testPathFilter()
    }

    if (!this.validateRootPath()) {
      return `Error: Cannot access root directory: ${this.rootPath}`
    }

    try {
      const rootNodes = this.readDirectoryStructure(this.rootPath)
      
      if (this.debug) {
        console.log(`Found ${rootNodes.length} root nodes after filtering`)
      }
      
      if (rootNodes.length === 0) {
        return `No files or directories found in ${this.rootPath} after applying filters`
      }
      
      const result = this.treeNodesToString(rootNodes)
      
      if (this.debug) {
        console.log(`Generated tree length: ${result.length} characters`)
      }
      
      return result
      
    } catch (error) {
      console.error('Error generating tree:', error)
      return `Error generating tree: ${error}`
    }
  }

  /**
   * Génère l'arborescence simplifiée
   */
  public generateSimpleTree(): string {
    if (this.debug) {
      console.log('\n=== TreeGenerator Simple Debug Info ===')
    }

    if (!this.validateRootPath()) {
      return `Error: Cannot access root directory: ${this.rootPath}`
    }

    try {
      const rootNodes = this.readDirectoryStructure(this.rootPath)
      
      if (this.debug) {
        console.log(`Found ${rootNodes.length} root nodes after filtering`)
      }
      
      if (rootNodes.length === 0) {
        return `No files or directories found in ${this.rootPath} after applying filters`
      }
      
      const result = this.treeNodesToSimpleString(rootNodes)
      
      if (this.debug) {
        console.log(`Generated simple tree length: ${result.length} characters`)
      }
      
      return result
      
    } catch (error) {
      console.error('Error generating simple tree:', error)
      return `Error generating simple tree: ${error}`
    }
  }

  /**
   * Retourne des informations de diagnostic
   */
  public getDiagnosticInfo(): string {
    const info = [
      `Root Path: ${this.rootPath}`,
      `Current Working Directory: ${process.cwd()}`,
      `GITHUB_WORKSPACE: ${process.env.GITHUB_WORKSPACE || 'not set'}`,
      `Root path exists: ${fs.existsSync(this.rootPath)}`,
      `Root path is directory: ${fs.existsSync(this.rootPath) && fs.statSync(this.rootPath).isDirectory()}`
    ]
    
    try {
      const entries = fs.readdirSync(this.rootPath)
      info.push(`Root directory entry count: ${entries.length}`)
    } catch (error) {
      info.push(`Cannot read root directory: ${error}`)
    }
    
    return info.join('\n')
  }
}
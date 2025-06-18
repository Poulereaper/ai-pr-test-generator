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

  constructor(pathFilter: PathFilter) {
    this.rootPath = process.cwd()
    this.pathFilter = pathFilter
  }

  /**
   * Lit récursivement la structure du répertoire
   */
  private readDirectoryStructure(dirPath: string, relativePath: string = ''): TreeNode[] {
    const nodes: TreeNode[] = []

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name

        // Ignore les fichiers/dossiers .git
        if (entry.name.startsWith('.git')) {
          continue
        }

        // Utilise la méthode check() de votre PathFilter
        if (!this.pathFilter.check(entryRelativePath)) {
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
        }

        nodes.push(node)
      }
    } catch (error) {
      console.warn(`Impossible de lire le répertoire ${dirPath}:`, error)
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
   * Génère l'arborescence complète avec connecteurs
   */
  public generateTree(): string {
    const rootNodes = this.readDirectoryStructure(this.rootPath)
    return this.treeNodesToString(rootNodes)
  }

  /**
   * Génère l'arborescence simplifiée
   */
  public generateSimpleTree(): string {
    const rootNodes = this.readDirectoryStructure(this.rootPath)
    return this.treeNodesToSimpleString(rootNodes)
  }
}
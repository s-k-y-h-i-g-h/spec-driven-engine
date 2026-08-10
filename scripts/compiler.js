import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { logger } from './logger.js';

export class SpecCompiler {
  constructor(config) {
    this.config = config;
  }

  /**
   * Compile a markdown spec file into an ExecutionPlan
   */
  async compile(specPath) {
    const content = fs.readFileSync(specPath, 'utf8');
    const { data: frontmatter, content: markdownContent } = matter(content);

    // Validate frontmatter
    this.validateFrontmatter(frontmatter);

    // Parse requirements from markdown
    const requirements = this.parseRequirements(markdownContent);

    // Parse quality gates from frontmatter
    const qualityGates = frontmatter.quality_gate || frontmatter.quality_gates || {};

    // Parse deployment config from frontmatter
    const deployment = frontmatter.deployment || {};

    // Build execution plan
    const plan = {
      specPath,
      project: frontmatter.project || path.basename(specPath, '.md'),
      version: frontmatter.version || '1.0.0',
      specVersion: frontmatter.spec_version || '1.0',
      requirements,
      qualityGates,
      deployment,
      qualityGatesConfig: this.config.quality_gates || {},
      createdAt: new Date().toISOString()
    };

    logger.info(`Compiled spec: ${plan.project} (${requirements.length} requirements)`);
    return plan;
  }

  validateFrontmatter(frontmatter) {
    if (!frontmatter.project) {
      throw new Error('Spec must have a project name in frontmatter');
    }
    if (!frontmatter.spec_version) {
      console.warn('Spec missing spec_version, defaulting to 1.0');
    }
  }

  parseRequirements(markdown) {
    const requirements = [];
    const lines = markdown.split('\n');
    
    let currentReq = null;
    let inRequirementsSection = false;

    for (const line of lines) {
      // Detect requirements section
      if (line.match(/^##\s+Requirements/i)) {
        inRequirementsSection = true;
        continue;
      }
      if (line.match(/^##\s/) && inRequirementsSection) {
        inRequirementsSection = false;
      }

      if (!inRequirementsSection) continue;

      // Match requirement headers: ### REQ-001: Title
      const reqMatch = line.match(/^###\s+(REQ-\d+):\s*(.+)$/);
      if (reqMatch) {
        if (currentReq) {
          requirements.push(currentReq);
        }
        currentReq = {
          id: reqMatch[1],
          title: reqMatch[2].trim(),
          description: '',
          acceptance: '',
          priority: 'medium',
          dependencies: [],
          status: 'pending'
        };
        continue;
      }

      // Match bullet points under a requirement
      if (currentReq && line.match(/^-\s+\*\*(.+?)\*\*:\s*(.+)$/)) {
        const [, key, value] = line.match(/^-\s+\*\*(.+?)\*\*:\s*(.+)$/);
        const lowerKey = key.toLowerCase();
        
        switch (lowerKey) {
          case 'description':
            currentReq.description = value.trim();
            break;
          case 'acceptance':
            currentReq.acceptance = value.trim();
            break;
          case 'priority':
            currentReq.priority = value.trim().toLowerCase();
            break;
          case 'dependencies':
            currentReq.dependencies = value.split(',').map(d => d.trim());
            break;
        }
      }
    }

    if (currentReq) {
      requirements.push(currentReq);
    }

    return requirements;
  }

  /**
   * Build execution plan DAG from requirements
   */
  buildExecutionPlan(requirements) {
    // Sort by dependencies (topological sort)
    const sorted = this.topologicalSort(requirements);
    
    return {
      tasks: sorted.map(req => ({
        id: req.id,
        title: req.title,
        description: req.description,
        acceptance: req.acceptance,
        priority: req.priority,
        dependencies: req.dependencies,
        status: 'pending',
        attempts: 0
      }))
    };
  }

  topologicalSort(requirements) {
    const map = new Map(requirements.map(r => [r.id, r]));
    const visited = new Set();
    const temp = new Set();
    const result = [];

    const visit = (id) => {
      if (temp.has(id)) {
        throw new Error(`Circular dependency detected: ${id}`);
      }
      if (visited.has(id)) return;
      
      temp.add(id);
      const req = map.get(id);
      if (req) {
        for (const dep of req.dependencies) {
          visit(dep);
        }
      }
      temp.delete(id);
      visited.add(id);
      result.push(req);
    };

    for (const req of requirements) {
      visit(req.id);
    }

    return result;
  }
}
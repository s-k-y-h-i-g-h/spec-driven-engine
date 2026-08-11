import { logger } from './logger.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export class DevEngine {
  constructor(config) {
    this.config = config;
    this.maxRetries = config.engine?.maxRetries || 3;
    this.timeoutMs = (config.engine?.timeoutMinutes || 30) * 60 * 1000;
  }

  /**
   * Resolve the project directory for a plan.
   * Priority: plan.projectDir (from frontmatter) → walk up from spec path → cwd.
   */
  resolveProjectDir(plan) {
    if (plan?.projectDir && fs.existsSync(path.join(plan.projectDir, 'package.json'))) {
      return plan.projectDir;
    }

    const specPath = plan?.specPath;
    const startDir = specPath ? path.dirname(specPath) : process.cwd();
    let dir = startDir;

    for (let i = 0; i < 6; i++) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    return process.cwd();
  }

  /**
   * Resolve available npm scripts from the project's package.json.
   */
  getAvailableScripts(plan) {
    const projectDir = this.resolveProjectDir(plan);
    try {
      const pkgPath = path.join(projectDir, 'package.json');
      if (!fs.existsSync(pkgPath)) return new Set();
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return new Set(Object.keys(pkg.scripts || {}));
    } catch (e) {
      logger.warn(`Could not read package.json: ${e.message}`);
      return new Set();
    }
  }

  /**
   * Execute a development plan using spec-kit phased approach:
   * Phase 1: Setup → Phase 2: Foundational → Phase 3+: User Stories (P1→P2→P3) → Polish
   */
  async execute(plan) {
    const { tasks, specPath, project, qualityGates } = plan;
    
    // Group tasks by phase and user story
    const phases = this.groupTasksByPhase(tasks);
    
    console.log(`Starting development for ${project}`);
    console.log(`Phases: ${Object.keys(phases).join(' → ')}`);
    
    let allCompleted = 0;
    const totalTasks = plan.tasks.length;

    // Execute phases in order: setup → foundational → user stories → polish
    const phaseOrder = ['setup', 'foundational', 'user-story', 'polish'];
    
    for (const phaseName of phaseOrder) {
      const phaseTasks = phases[phaseName] || [];
      if (phaseTasks.length === 0) continue;

      console.log(`\n=== Phase: ${phaseName.toUpperCase()} (${phaseTasks.length} tasks) ===`);
      
      const phaseResult = await this.executePhase(phaseName, phaseTasks, plan);
      if (!phaseResult.success) {
        console.error(`\n❌ Phase ${phaseName} failed. Stopping execution.`);
        return false;
      }
      allCompleted += phaseResult.completed;
    }

    console.log(`\n=== Development Complete ===`);
    console.log(`Completed: ${allCompleted}/${plan.tasks.length} tasks`);
    
    if (allCompleted === plan.tasks.length) {
      console.log('🎉 All tasks completed successfully!');
      return true;
    } else {
      console.log('⚠️ Some tasks incomplete. Manual intervention may be needed.');
      return false;
    }
  }

  /**
   * Group tasks by spec-kit phase: setup, foundational, user-story, polish
   * Tasks should have phase, story, parallel, priority fields
   */
  groupTasksByPhase(tasks) {
    const phases = {
      setup: [],
      foundational: [],
      'user-story': [],
      polish: []
    };

    for (const task of tasks) {
      const phase = task.phase || this.inferPhase(task);
      const story = task.story || 'unknown';
      const parallel = task.parallel || false;
      const priority = task.priority || 'medium';
      const storyId = task.storyId || task.story || 'US1';

      // Create enhanced task with spec-kit format
      const enhancedTask = {
        ...task,
        phase,
        story: storyId,
        parallel,
        priority: task.priority || 'medium',
        // Format: [ID] [P?] [Story] Description
        formattedId: this.formatTaskId(task.id, task.parallel, storyId)
      };

      if (phases[phase]) {
        phases[phase].push(enhancedTask);
      } else {
        phases['user-story'].push(enhancedTask);
      }
    }

    // Sort user-story tasks by priority (P1 → P2 → P3)
    if (phases['user-story'].length > 0) {
      phases['user-story'].sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
      });
    }

    return phases;
  }

  inferPhase(task) {
    // Infer phase from task metadata or ID patterns
    if (task.id?.startsWith('T00') && task.id <= 'T003') return 'setup';
    if (task.id?.startsWith('T00') && task.id >= 'T004' && task.id <= 'T009') return 'foundational';
    if (task.id?.startsWith('T01') || task.id?.startsWith('T02') || task.id?.startsWith('T03')) return 'user-story';
    return 'user-story';
  }

  formatTaskId(id, parallel, story) {
    const p = id.includes('P') ? '' : (parallel ? ' [P]' : '');
    const s = story ? ` [${story}]` : '';
    return `[${id}]${p}${s}`;
  }

  /**
   * Execute a single phase with proper parallel/sequential handling
   */
  async executePhase(phaseName, tasks, plan) {
    if (tasks.length === 0) return { success: true, completed: 0 };

    console.log(`\n=== Phase: ${phaseName.toUpperCase()} (${tasks.length} tasks) ===`);

    // For foundational phase: run all tasks (some parallel) - MUST complete before user stories
    // For user-story: can run stories in parallel if staffed, otherwise sequential by priority
    // For setup/polish: run parallelizable tasks in parallel

    let completed = 0;
    let success = true;

    if (phaseName === 'foundational') {
      // Foundational: run all tasks (some parallel) - MUST complete before user stories
      const result = await this.executeTaskGroup(tasks, plan, true);
      return { success: result.success, completed: result.completed };
    } else if (phaseName === 'user-story') {
      // Group by story, can run stories in parallel if staffed
      // For now: sequential by priority (P1 → P2 → P3)
      const stories = this.groupByStory(tasks);
      const storyOrder = Object.keys(stories).sort((a, b) => {
        const priorityMap = { 'US1': 0, 'US2': 1, 'US3': 2 };
        return (priorityMap[a] || 99) - (priorityMap[b] || 99);
      });

      let totalCompleted = 0;
      for (const storyId of storyOrder) {
        const storyTasks = stories[storyId];
        console.log(`\n  → User Story: ${storyId} (${storyTasks.length} tasks)`);
        
        const result = await this.executeTaskGroup(storyTasks, plan, false);
        if (!result.success) return { success: false, completed: totalCompleted };
        totalCompleted += result.completed;
      }
      return { success: true, completed: totalCompleted };
    } else {
      // Setup and polish: run all, parallel where marked
      const result = await this.executeTaskGroup(tasks, plan, false);
      return { success: result.success, completed: result.completed };
    }
  }

  groupByStory(tasks) {
    const groups = {};
    for (const task of tasks) {
      const story = task.story || 'US1';
      if (!groups[story]) groups[story] = [];
      groups[story].push(task);
    }
    return groups;
  }

  /**
   * Execute a group of tasks, running parallel ones in parallel
   */
  async executeTaskGroup(tasks, plan, allRequired) {
    let completed = 0;
    let success = true;

    // Separate parallel and sequential tasks
    const parallelTasks = tasks.filter(t => t.parallel);
    const sequentialTasks = tasks.filter(t => !t.parallel);

    // Run parallel tasks concurrently
    if (parallelTasks.length > 0) {
      console.log(`  Running ${parallelTasks.length} parallel tasks...`);
      const results = await Promise.all(
        parallelTasks.map(task => this.executeSingleTask(task, plan))
      );
      for (const result of results) {
        if (result.success) completed++;
        else success = false;
      }
    }

    // Run sequential tasks one by one
    for (const task of sequentialTasks) {
      const result = await this.executeSingleTask(task, plan);
      if (result.success) completed++;
      else {
        success = false;
        if (allRequired) break;
      }
    }

    return { success, completed };
  }

  /**
   * Execute a single task with retries and quality gates
   */
  async executeSingleTask(task, plan) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      console.log(`\n--- Task ${task.formattedId || task.id} (Attempt ${attempt}/${this.maxRetries}) ---`);
      console.log(`  ${task.title}`);
      
      try {
        const success = await this.executeTask(task, 0, 1);
        
        if (success) {
          const passed = await this.validateQualityGates(plan);
          if (passed) {
            task.status = 'done';
            console.log(`✅ ${task.formattedId || task.id} completed successfully`);
            return { success: true };
          } else {
            console.log('❌ Quality gates failed, retrying...');
          }
        } else {
          console.log(`❌ Attempt ${attempt} failed`);
        }
      } catch (error) {
        console.error(`Error on attempt ${attempt}:`, error.message);
      }

      if (attempt < this.maxRetries) {
        console.log(`Retrying in 5 seconds...`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    return { success: false };
  }

  async executeTask(task, taskNum, totalTasks) {
    const prompt = this.buildTaskPrompt(task);
    
    console.log(`Implementing: ${task.title}`);
    console.log(`Description: ${task.description}`);
    console.log(`Acceptance: ${task.acceptance}`);
    
    // Simulate work - in reality this would invoke the AI agent
    await new Promise(r => setTimeout(r, 2000));
    
    return true;
  }

  buildTaskPrompt(task) {
    return `
Task: ${task.formattedId || task.id} - ${task.title}
Description: ${task.description}
Acceptance Criteria: ${task.acceptance}
Priority: ${task.priority}
Dependencies: ${task.dependencies.join(', ') || 'none'}
Story: ${task.story || 'US1'}
Parallel: ${task.parallel ? 'Yes' : 'No'}

Implement this task and ensure it meets the acceptance criteria.
Run tests, linting, and type-checking after implementation.
    `.trim();
  }

  async validateQualityGates(plan) {
    console.log('Running quality gates...');

    const availableScripts = this.getAvailableScripts(plan);
    const specGates = this.config.qualityGates || {};
    
    const checks = [
      { name: 'Tests', cmd: 'npm test', key: 'test', required: true },
      { name: 'Lint', cmd: 'npm run lint', key: 'lint', required: specGates.lint === true },
      { name: 'Type Check', cmd: 'npm run type-check', key: 'type-check', required: specGates['type-check'] === true }
    ];

    for (const check of checks) {
      if (!availableScripts.has(check.key)) {
        if (check.required) {
          logger.warn(`${check.name} gate required but '${check.key}' script not found in package.json — skipping`);
        } else {
          logger.info(`${check.name} gate skipped (no '${check.key}' script in package.json)`);
        }
        continue;
      }

      try {
        const projectDir = this.resolveProjectDir(plan);
        execSync(check.cmd, { stdio: 'pipe', timeout: 120000, cwd: projectDir });
        console.log(`  ✅ ${check.name}`);
      } catch (error) {
        console.error(`  ❌ ${check.name} failed`);
        if (check.required) return false;
      }
    }

    return true;
  }

  /**
   * Resolve the project directory for a plan.
   * Priority: plan.projectDir (from frontmatter) → walk up from spec path → cwd.
   */
  resolveProjectDir(plan) {
    if (plan?.projectDir && fs.existsSync(path.join(plan.projectDir, 'package.json'))) {
      return plan.projectDir;
    }

    const specPath = plan?.specPath;
    const startDir = specPath ? path.dirname(specPath) : process.cwd();
    let dir = startDir;

    for (let i = 0; i < 6; i++) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    return process.cwd();
  }

  /**
   * Resolve available npm scripts from the project's package.json.
   */
  getAvailableScripts(plan) {
    const projectDir = this.resolveProjectDir(plan);
    try {
      const pkgPath = path.join(projectDir, 'package.json');
      if (!fs.existsSync(pkgPath)) return new Set();
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return new Set(Object.keys(pkg.scripts || {}));
    } catch (e) {
      logger.warn(`Could not read package.json: ${e.message}`);
      return new Set();
    }
  }
}
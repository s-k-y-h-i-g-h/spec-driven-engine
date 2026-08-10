import { logger } from './logger.js';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export class DevEngine {
  constructor(config) {
    this.config = config;
    this.maxRetries = config.engine?.maxRetries || 3;
    this.timeoutMs = (config.engine?.timeoutMinutes || 30) * 60 * 1000;
  }

  /**
   * Execute a development plan iteratively until all tasks are complete
   */
  async execute(plan) {
    const { tasks, specPath, project, qualityGates } = plan;
    const totalTasks = tasks.length;
    let completed = 0;

    console.log(`Starting development for ${project}: ${totalTasks} tasks`);

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      // Skip if already done
      if (task.status === 'done') continue;

      // Check dependencies
      const unmetDeps = task.dependencies.filter(depId => {
        const dep = tasks.find(t => t.id === depId);
        return dep && dep.status !== 'done';
      });

      if (unmetDeps.length > 0) {
        console.log(`Skipping ${task.id} - waiting for dependencies: ${unmetDeps.join(', ')}`);
        continue;
      }

      // Execute task with retries
      let success = false;
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        console.log(`\n--- Task ${i+1}/${totalTasks}: ${task.title} (Attempt ${attempt}/${this.maxRetries}) ---`);
        
        try {
          const success = await this.executeTask(task, i + 1, totalTasks);
          
          if (success) {
            // Verify against quality gates
            const passed = await this.validateQualityGates();
            
            if (passed) {
              task.status = 'done';
              completed++;
              console.log(`��✅ Task ${task.id} completed successfully`);
              break;
            } else {
              console.log('��❌ Quality gates failed, retrying...');
            }
          } else {
            console.log(`��❌ Attempt ${attempt} failed`);
          }
        } catch (error) {
          console.error(`Error on attempt ${attempt}:`, error.message);
        }

        if (attempt < this.maxRetries) {
          console.log(`Retrying in 5 seconds...`);
          await new Promise(r => setTimeout(r, 5000));
        }
      }

      if (!tasks.find(t => t.id === task.id)?.status === 'done') {
        console.error(`��❌ Task ${task.id} failed after ${this.maxRetries} attempts`);
        // Could pause for human intervention here
        break;
      }
    }

    console.log(`\n=== Development Complete ===`);
    console.log(`Completed: ${completed}/${totalTasks} tasks`);
    
    if (completed === totalTasks) {
      console.log('���🎉 All tasks completed successfully!');
      return true;
    } else {
      console.log('��⚠��️ Some tasks incomplete. Manual intervention may be needed.');
      return false;
    }
  }

  /**
   * Execute a single task using Hermes agent
   */
  async executeTask(task, taskNum, totalTasks) {
    const prompt = this.buildTaskPrompt(task);
    const result = await this.invokeHermes(prompt);
    return result !== null && result !== undefined && result.length > 0;
  }

  buildTaskPrompt(task) {
    return `
Task: ${task.id} - ${task.title}
Description: ${task.description}
Acceptance Criteria: ${task.acceptance}
Priority: ${task.priority}
Dependencies: ${task.dependencies.join(', ') || 'none'}

Implement this task and ensure it meets the acceptance criteria.
Run tests, linting, and type-checking after implementation.
    `.trim();
  }

  invokeHermes(prompt) {
    return new Promise((resolve, reject) => {
      const hermes = spawn('hermes', ['--prompt', prompt], {
        encoding: 'utf8',
        timeout: this.timeoutMs,
        maxBuffer: 10 * 1024 * 1024 // 10MB max output
      });

      let stdout = '';
      let stderr = '';

      hermes.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      hermes.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      hermes.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Hermes exited with code ${code}: ${stderr}`));
        }
      });

      hermes.on('error', (err) => {
        reject(new Error(`Failed to start Hermes: ${err.message}`));
      });
    });
  }

  async validateQualityGates() {
    console.log('Running quality gates...');
    
    // Run tests
    try {
      execSync('npm test', { stdio: 'pipe', timeout: 120000 });
      console.log('  � ✅ Tests passed');
    } catch (error) {
      console.error('  �� ❌ Tests failed');
      return false;
    }

    // Run linting
    try {
      execSync('npm run lint', { stdio: 'pipe', timeout: 120000 });
      console.log('  � ✅ Linting passed');
    } catch (error) {
      console.error('  �� ❌ Linting failed');
      return false;
    }

    // Run type checking
    try {
      execSync('npm run type-check', { stdio: 'pipe', timeout: 120000 });
      console.log('  � ✅ Type check passed');
    } catch (error) {
      console.error('  �� ❌ Type check failed');
      return false;
    }
    
    return true;
  }
}
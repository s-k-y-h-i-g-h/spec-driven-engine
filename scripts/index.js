#!/usr/bin/env node
/**
 * Spec-Driven Engine CLI
 * Main entry point for the spec-driven development engine skill.
 */

import { Command } from 'commander';
import { SpecWatcher } from './watcher.js';
import { SpecCompiler } from './compiler.js';
import { DevEngine } from './dev_engine.js';
import { ConfigManager } from './config.js';
import { logger } from './logger.js';
import fs from 'fs';

const program = new Command();

program
  .name('spec-driven-engine')
  .description('Spec-Driven Development Engine - watches specs and implements them')
  .version('0.1.0');

program
  .command('start')
  .description('Start watching a directory for spec changes')
  .requiredOption('-d, --dir <path>', 'Directory to watch for spec changes')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    const config = await ConfigManager.load(options.config);
    config.spec_dir = options.dir;
    
    logger.info(`Starting spec-driven engine on directory: ${options.dir}`);
    
    const watcher = new SpecWatcher(options.dir, config);
    const compiler = new SpecCompiler(config);
    const engine = new DevEngine(config);
    
    await watcher.start(async (specPath) => {
      logger.info(`Spec changed: ${specPath}`);
      const plan = await compiler.compile(specPath);
      await engine.execute(plan);
    });
  });

program
  .command('stop')
  .description('Stop watching directory')
  .action(async () => {
    logger.info('Stopping spec-driven engine...');
    // Implementation would stop the watcher
  });

program
  .command('status')
  .description('Check engine status')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    const config = await ConfigManager.load(options.config);
    const specDir = config.spec_dir;

    console.log('Spec-Driven Engine Status');
    console.log('-------------------------');
    console.log(`Config file: ${ConfigManager.CONFIG_FILE}`);
    console.log(`Spec directory: ${specDir || '<not set>'}`);
    console.log(`Project directory: ${config.project_dir || '<auto-detect>'}`);

    if (specDir) {
      try {
        const files = await fs.promises.readdir(specDir);
        const mdFiles = files.filter((f) => f.endsWith('.md'));
        console.log(`Spec files found: ${mdFiles.length}`);
        if (mdFiles.length) {
          mdFiles.slice(0, 10).forEach((f) => console.log(`  - ${f}`));
          if (mdFiles.length > 10) {
            console.log(`  ... and ${mdFiles.length - 10} more`);
          }
        }
      } catch (e) {
        console.log(`Spec directory status: ${e.message}`);
      }
    }

    console.log(`Quality gates: ${JSON.stringify(config.quality_gates || {})}`);
    console.log(`Engine retries: ${config.engine?.maxRetries ?? 3}`);
    console.log(`Timeout minutes: ${config.engine?.timeoutMinutes ?? 30}`);
  });

program
  .command('run-once')
  .description('Run development process once on a specific spec')
  .requiredOption('-s, --spec <path>', 'Path to spec file')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    const config = await ConfigManager.load(options.config);
    const compiler = new SpecCompiler(config);
    const engine = new DevEngine(config);
    
    const plan = await compiler.compile(options.spec);
    await engine.execute(plan);
  });

program
  .command('init')
  .description('Initialize configuration interactively')
  .action(async () => {
    await ConfigManager.init();
  });

program.parse(process.argv);
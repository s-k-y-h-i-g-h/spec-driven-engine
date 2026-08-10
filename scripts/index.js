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
import path from 'path';

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
    try {
      const config = await ConfigManager.load(options.config);
      config.spec_dir = options.dir;
      
      logger.info(`Starting spec-driven engine on directory: ${options.dir}`);
      
      const watcher = new SpecWatcher(options.dir, config);
      const compiler = new SpecCompiler(config);
      const engine = new DevEngine(config);
      
      await watcher.start(async (specPath) => {
        logger.info(`Spec changed: ${specPath}`);
        try {
          const plan = await compiler.compile(specPath);
          logger.info(`Compiled spec with ${plan.requirements.length} requirements`);
          const success = await engine.execute(plan);
          if (success) {
            logger.info(`Development completed successfully for ${specPath}`);
          } else {
            logger.warn(`Development completed with issues for ${specPath}`);
          }
        } catch (error) {
          logger.error(`Error processing spec ${specPath}: ${error.message}`);
        }
      });
    } catch (error) {
      logger.error(`Failed to start engine: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop watching directory')
  .action(async () => {
    logger.info('Stopping spec-driven engine...');
    // In a real implementation, we'd track the watcher instance
    // For now, just log
    console.log('To stop the engine, please terminate the process.');
  });

program
  .command('status')
  .description('Check engine status')
  .action(async () => {
    logger.info('Spec-driven engine status:');
    logger.info('- Check running processes for "spec-driven-engine"');
    logger.info('- Check logs in ~/.hermes/logs/');
  });

program
  .command('run-once')
  .description('Run development process once on a specific spec')
  .requiredOption('-s, --spec <path>', 'Path to spec file')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      const config = await ConfigManager.load(options.config);
      const compiler = new SpecCompiler(config);
      const engine = new DevEngine(config);
      
      logger.info(`Running once on spec: ${options.spec}`);
      const plan = await compiler.compile(options.spec);
      logger.info(`Compiled spec with ${plan.requirements.length} requirements`);
      const success = await engine.execute(plan);
      if (success) {
        logger.info(`Development completed successfully`);
        process.exit(0);
      } else {
        logger.warn(`Development completed with issues`);
        process.exit(1);
      }
    } catch (error) {
      logger.error(`Error running spec: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize configuration interactively')
  .action(async () => {
    await ConfigManager.init();
  });

program.parse(process.argv);
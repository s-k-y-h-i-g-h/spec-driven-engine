import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import { logger } from './logger.js';

export class SpecWatcher extends EventEmitter {
  constructor(specDir, config) {
    super();
    this.specDir = specDir;
    this.config = config;
    this.watcher = null;
    this.debounceTimers = new Map();
  }

  /**
   * Start watching the spec directory
   */
  async start(onSpecChange) {
    this.on('specChange', onSpecChange);
    
    this.watcher = chokidar.watch(this.specDir, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      }
    });

    this.watcher
      .on('add', (path) => this.handleChange('add', path))
      .on('change', (path) => this.handleChange('change', path))
      .on('unlink', (path) => this.handleChange('unlink', path))
      .on('error', (error) => console.error('Watcher error:', error))
      .on('ready', () => console.log(`Watching ${this.specDir} for spec changes...`));

    return this;
  }

  handleChange(event, path) {
    if (!path.endsWith('.md')) return;
    
    // Debounce rapid changes to the same file
    const existingTimer = this.debounceTimers.get(path);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(path);
      this.emit('specChange', path, event);
    }, 500);

    this.debounceTimers.set(path, timer);
  }

  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    this.removeAllListeners();
  }
}
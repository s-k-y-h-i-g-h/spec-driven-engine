import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export class ConfigManager {
  static CONFIG_DIR = path.join(process.env.HOME, '.config', 'spec-driven-engine');
  static CONFIG_FILE = path.join(ConfigManager.CONFIG_DIR, 'config.yaml');

  static async load(configPath = null) {
    const filePath = configPath || this.CONFIG_FILE;
    
    if (!fs.existsSync(filePath)) {
      return this.getDefaults();
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const config = yaml.load(content);
    
    return { ...this.getDefaults(), ...config };
  }

  static async save(config) {
    if (!fs.existsSync(this.CONFIG_DIR)) {
      fs.mkdirSync(this.CONFIG_DIR, { recursive: true });
    }

    const content = yaml.dump(config, { indent: 2 });
    fs.writeFileSync(this.CONFIG_FILE, content);
  }

  static async init() {
    if (fs.existsSync(this.CONFIG_FILE)) {
      console.log('Config already exists at:', this.CONFIG_FILE);
      return;
    }

    const config = this.getDefaults();
    await this.save(config);
    console.log('Created default config at:', this.CONFIG_FILE);
  }

  static getDefaults() {
    return {
      spec_dir: '/home/skyhigh/specs',
      github: {
        repo: '',
        branch_prefix: 'spec/'
      },
      deployment: {
        staging_url: '',
        prod_url: '',
        prod_approval_required: true
      },
      engine: {
        max_retries: 3,
        timeout_minutes: 30
      },
      quality_gates: {
        test_coverage: '>=80%',
        type_check: 'strict',
        security_scan: 'high',
        performance_budget: 'p95 < 200ms'
      }
    };
  }
}
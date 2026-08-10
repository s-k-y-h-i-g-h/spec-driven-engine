---
name: spec-driven-engine
description: >
  Watches a directory for markdown spec changes and runs an iterative
  development process until the spec is satisfied. Pushes to GitHub
  and deploys to a live server.
---

# Spec-Driven Development Engine

A Hermes skill that watches a directory for markdown specification files,
and when they change, runs an iterative development process until the
spec is implemented to a defined standard. Automatically pushes to
GitHub and deploys to a live server.

## Quick Start

```bash
# Install the skill
hermes skills add https://github.com/yourusername/spec-driven-engine --skill spec-driven-engine

# Run the skill to set up monitoring
hermes spec-driven-engine
```

## What It Does

1. **Watches** a directory for markdown (`.md`) specification files
2. **Compiles** specs into executable development plans
4. **Runs iterative development loops** until specs are satisfied:
   - Plans implementation steps
   - Writes code
   - Runs tests, linting, type-checking
   - Verifies against spec acceptance criteria
5. **Pushes** changes to GitHub (feature branch)
6. **Deploys** to staging for verification
7. **Awaits manual approval** for production deployment

## Spec Format

Specs are markdown files with YAML frontmatter:

```markdown
---
spec_version: "1.0"
project: "User Dashboard"
version: "2.1.0"
quality_gates:
  test_coverage: ">=80%"
  type_check: "strict"
  security_scan: "high"
  performance_budget: "p95 < 200ms"
---

# User Dashboard v2.1

## Requirements

### REQ-001: Real-time metrics dashboard
- **Description**: Display real-time CPU, memory, network metrics
- **Acceptance**: Updates every 2s, <100ms latency
- **Priority**: high
- **Dependencies**: [REQ-003]

### REQ-002: User preference persistence
- **Description**: Save dashboard layout per user
- **Acceptance**: Survives browser refresh, syncs across devices
- **Priority**: medium

## Quality Gates (enforced per iteration)
- All tests pass (unit + integration)
- TypeScript strict mode: zero errors
- ESLint: zero warnings
- Bundle size: < 500KB gzipped
- Lighthouse performance: >90

## Deployment
- Staging: auto-deploy on feature branch push
- Production: manual approval + canary (10% → 100%)
```

## Commands

| Command | Description |
|---------|-------------|
| `hermes spec-driven-engine start --dir /path/to/specs` | Start watching directory |
| `hermes spec-driven-engine stop` | Stop watching |
| `hermes spec-driven-engine status` | Check engine status |
| `hermes spec-driven-engine run-once --spec path/to/spec.md` | Run once on specific spec |

## Architecture

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  SPEC DIR   │───▶│  SPEC COMPILER   │───▶│  DEV ENGINE     │
│  (watch)    │    │  (md → Plan)     │    │  (loop)         │
└─────────────┘    └──────────────────┘    └────────┬────────┘
                                                     │
                    ┌────────────────────────────────┘
                    ▼
         ┌────────────────────────────────┐
         │  QUALITY GATES                 │
         │  - Tests pass                  │
         │  - Lint clean                  │
         │  - Type check pass             │
         │  - Spec compliance check       │
         └────────────┬───────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
   ┌─────────────┐          ┌─────────────┐
   │ GIT AUTO-PR │          │  DEPLOY     │
   │ (feature    │          │  (staging   │
   │  branch)    │          │   → prod)   │
   └─────────────┘          └─────────────┘
```

## Configuration

Configuration is stored in `~/.config/spec-driven-engine/config.yaml`:

```yaml
spec_dir: "/path/to/your/specs"
github:
  repo: "owner/repo"
  branch_prefix: "spec/"
deployment:
  staging_url: "https://staging.example.com"
  prod_url: "https://example.com"
  prod_approval_required: true
engine:
  max_retries: 3
  timeout_minutes: 30
```

## Quality Gates (configurable per spec)

- All tests pass (unit + integration)
- Lint clean (ESLint, prettier)
- Type check pass (TypeScript strict mode)
- Spec compliance check (acceptance criteria met)
- Test coverage threshold (configurable)
- Bundle size limits (configurable)
- Performance budgets (configurable)

## How It Works

1. **Watch**: Uses `chokidar` to monitor the spec directory for `.md` file changes
2. **Compile**: Parses markdown spec + frontmatter → `ExecutionPlan` (DAG of tasks)
3. **Execute**: Runs iterative development loop:
   - Picks next task from plan
   - Uses AI to implement task (via Hermes)
   - Runs validation (tests, lint, type-check, spec compliance)
   - On failure: retries up to max retries, then pauses for human
   - On success: Commits to feature branch
4. **Deploy**: Pushes feature branch → auto-deploys to staging
5. **Promote**: Manual approval → promote to production

## Requirements

- Node.js 18+ (for file watching via chokidar)
- Hermes CLI installed and configured
- Git repository initialized in spec directory
- GitHub CLI (`gh`) authenticated
- Docker (for isolated execution environment)

## License

MIT
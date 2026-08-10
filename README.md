# Spec-Driven Development Engine

A Hermes skill that watches a directory for markdown specification files and runs an iterative development process until the spec is implemented to a defined standard. Automatically pushes to GitHub and deploys to a live server.

## Installation

```bash
hermes skills add https://github.com/s-k-y-h-i-g-h/spec-driven-engine --skill spec-driven-engine
```

## Usage

```bash
# Initialize configuration
hermes spec-driven-engine init

# Start watching a directory for spec changes
hermes spec-driven-engine start --dir /path/to/your/specs

# Run once on a specific spec
hermes spec-driven-engine run-once --spec path/to/spec.md
```

## Spec Format

See the documentation in the skill for the expected markdown spec format with YAML frontmatter.

## License

MIT
# Contributing to NovaLume

Thanks for your interest in contributing! We welcome contributions of all
kinds: bug reports, feature suggestions, documentation improvements, and code
changes.

## Getting Started

1. Fork the repository.
2. Clone your fork:
   ```bash
   git clone https://github.com/[YOUR_USERNAME]/novalume.git
   cd novalume
   ```
3. Copy the environment file and fill in your API keys:
   ```bash
   cp .env.example .env
   ```
4. Set up the backend:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```
5. Set up the frontend:
   ```bash
   cd frontend
   npm install
   ```

## Development Workflow

1. Create a feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes.
3. Verify everything still compiles:
   ```bash
   # Backend
   cd backend && python -c "import config; print('ok')"

   # Frontend
   cd frontend && npx tsc --noEmit && npx vite build
   ```
4. Commit with a descriptive message:
   ```bash
   git commit -m "feat: add your feature description"
   ```
5. Push and open a Pull Request.

## Code Style

- **Python**: Follow PEP 8. Use descriptive variable names.
- **TypeScript/React**: Follow the existing patterns in the codebase.
  Components use functional style with hooks.
- **CSS**: Tailwind utility classes preferred. Avoid custom CSS unless
  absolutely necessary.

## Pull Request Guidelines

- Keep PRs focused on a single concern. Split large changes into multiple PRs.
- Update the README or CHANGELOG if your change affects user-facing behavior.
- Make sure the CI pipeline passes.
- Be responsive to review feedback.

## Reporting Issues

- Use the GitHub issue tracker.
- Check existing issues before opening a duplicate.
- Include steps to reproduce, expected behavior, and actual behavior.
- Include browser/OS/runtime versions if relevant.

## Questions?

Open a Discussion on GitHub or reach out via the repository's contact methods.

Thanks for helping make NovaLume better!

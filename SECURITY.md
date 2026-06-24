# Security Policy

## Reporting a Vulnerability

We take the security of NovaLume seriously. If you discover a security
vulnerability, please report it privately — **do not** open a public issue.

**How to report:**

1. Email the maintainer at the address listed in the GitHub repository's
   `SECURITY.md` or `CODEOWNERS` file.
2. Alternatively, use GitHub's private vulnerability reporting feature at:
   `https://github.com/[OWNER]/novalume/security/advisories`

Please include:

- A description of the vulnerability
- Steps to reproduce (if applicable)
- Potential impact

You should receive a response within 48 hours. We'll keep you informed as the
issue is investigated and resolved.

## What to expect

- We'll acknowledge receipt within 2 business days.
- We'll provide an initial assessment within 5 business days.
- We'll work on a fix and keep you updated on progress.
- We'll credit you in the release notes (unless you prefer to remain anonymous).

## Scope

The following are **in scope**:

- The NovaLume application itself (Python backend, React frontend)
- Authentication and authorization mechanisms
- API endpoints
- Data storage and retrieval

The following are **out of scope**:

- Third-party dependencies (report those to their respective maintainers)
- LLM provider API keys (manage those per provider's security policy)
- Operating system or network-level vulnerabilities

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅ Active |
| < 1.0   | ❌        |

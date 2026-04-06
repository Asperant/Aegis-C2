# Security Policy

## Supported Versions

Security fixes are applied to the latest code on `main`.

## Reporting a Vulnerability

Please do not open public issues for sensitive vulnerabilities.

Use private reporting channels (for example, GitHub private security advisory or direct maintainer contact).

Include:

- impact summary
- affected components and versions
- reproduction steps or proof of concept
- suggested mitigation (if available)

## Response Expectations

- Initial triage target: within 72 hours
- Coordinated fix and disclosure timing: case-by-case, based on severity

## Secret Handling Rules

- Never commit credentials, tokens, or private keys.
- Keep `.env` local only.
- Use `.env.example` placeholders only.
- Rotate credentials immediately if exposure is suspected.

## If Secrets Were Committed

1. Rotate exposed secrets immediately.
2. Remove leaked material from git history.
3. Force-push cleaned history if required.
4. Invalidate prior keys/tokens.
5. Document the incident and remediation in release notes or internal logs.

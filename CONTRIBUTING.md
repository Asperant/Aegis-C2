# Contributing to Aegis C2

Thanks for contributing to Aegis C2. We welcome improvements in reliability, security, developer experience, and documentation quality.

## Development Model

- `main`: stable, release-ready branch
- `develop`: integration branch for active work
- feature and fix work should target `develop`

## Branch Naming

- `feature/<short-description>`
- `fix/<short-description>`
- `chore/<short-description>`
- `release/<version>`
- `hotfix/<short-description>`

## Commit Style

Use Conventional Commits:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `test: ...`
- `chore: ...`
- `refactor: ...`

## Pull Request Expectations

- Keep the PR scope focused and reviewable.
- Explain what changed and why.
- Include validation evidence (build/test output summary).
- Include screenshots or GIFs for UI-visible changes.
- Call out breaking changes explicitly.
- Link related issues where available.

## Local Quality Gates

Run these checks before opening a PR:

```bash
dotnet build aegis-c2.sln -c Release
dotnet test tests/Aegis_API.Tests/Aegis_API.Tests.csproj -c Release
python3 -m pytest -q
python3 -m py_compile GKS_Server/*.py
cd aegis-ui && npm run lint && npm run test && npm run build
```

## Suggested Workflow

1. Fork and create a branch from `develop`.
2. Implement the change with tests/docs updates as needed.
3. Run local quality gates.
4. Open PR to `develop`.
5. Address review feedback and keep CI green.

## Merge Policy

- CI must pass before merge.
- Prefer squash merge using a conventional commit title.
- Use `main` PRs only for `release/*` and `hotfix/*` flows.

# Release Process

This repository uses Semantic Versioning (`MAJOR.MINOR.PATCH`).

## 1. Prepare release branch

```bash
git checkout develop
git pull
git checkout -b release/v1.0.0
```

## 2. Run quality gates

```bash
dotnet build aegis-c2.sln -c Release
dotnet test tests/Aegis_API.Tests/Aegis_API.Tests.csproj -c Release
python3 -m pytest -q
cd aegis-ui && npm run lint && npm run test && npm run build
```

## 3. Finalize docs

- Update `CHANGELOG.md` (move release notes from `Unreleased` to version section)
- Ensure README screenshots and setup steps are accurate
- Confirm `OPEN_SOURCE_CHECKLIST.md` items are completed

## 4. Merge and tag

```bash
git checkout main
git merge --no-ff release/v1.0.0
git tag -a v1.0.0 -m "Aegis C2 v1.0.0"
git push origin main
git push origin v1.0.0
```

## 5. Create GitHub release

- Title: `v1.0.0`
- Use `.github/release-template.md`
- Attach generated artifacts from the tag workflow


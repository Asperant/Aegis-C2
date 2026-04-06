# Open Source Release Checklist

Use this checklist before making the repository public.

## 1. Security

- [ ] Rotate all credentials used during development (DB passwords, JWT secret, admin password).
- [ ] Regenerate all crypto keys in `keys/` for a fresh public release.
- [x] Confirm no key files are tracked: `git ls-files keys`
- [x] Confirm no `.env` file is tracked: `git ls-files .env`
- [ ] If secrets were committed previously, purge history and force-push cleaned history.

## 2. Repository governance

- [x] `README.md` explains architecture, setup, and local run steps.
- [x] `LICENSE` exists and matches intended open-source usage.
- [x] `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` are present.
- [x] `SECURITY.md` includes a clear vulnerability reporting process.
- [x] `.github` issue/PR templates are active.
- [x] `CHANGELOG.md` is up to date.

## 3. Quality gates

- [x] `dotnet build aegis-c2.sln -c Release`
- [x] `dotnet test tests/Aegis_API.Tests/Aegis_API.Tests.csproj -c Release`
- [x] `python3 -m pytest -q`
- [x] `cd aegis-ui && npm run lint && npm run build`
- [x] `cd aegis-ui && npm run test`
- [x] `python3 -m py_compile GKS_Server/*.py`
- [ ] `docker compose up --build -d` followed by smoke checks

## 4. Portfolio readiness

- [ ] Add real screenshots/GIFs of key flows (dashboard, login, telemetry).
- [ ] Add a short architecture diagram (API, GKS, UAV, UI, Redis, Postgres).
- [ ] Prepare a first tagged release (`v1.0.0`) with release notes.
- [ ] Verify tag workflow `.github/workflows/release.yml` produces artifacts.
- [ ] Add project roadmap/milestones in GitHub Projects or Issues.

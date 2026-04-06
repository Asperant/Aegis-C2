# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- Open-source governance baseline (`LICENSE`, `CONTRIBUTING`, `SECURITY`, templates)
- Fail-fast CI checks and Docker integration smoke validation
- API (`xUnit`), GKS (`pytest`), and UI (`Vitest`) starter test suites
- Portfolio-oriented README with architecture, setup, and API reference

## [1.0.0] - Planned

### Added

- Initial public-ready baseline for Aegis C2
- .NET API + SignalR hub
- Python GKS server
- C++ UAV client
- React UI + Nginx gateway
- Docker Compose and Helm/Minikube deployment paths

### Security

- Removed historical private key artifacts from git history
- Added secret-handling policy and release checklist

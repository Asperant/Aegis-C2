## Summary

Describe what changed.

## Why

Describe the reason and expected impact.

## Validation

- [ ] `dotnet build aegis-c2.sln -c Release`
- [ ] `dotnet test tests/Aegis_API.Tests/Aegis_API.Tests.csproj -c Release`
- [ ] `python3 -m pytest -q`
- [ ] `cd aegis-ui && npm run lint && npm run test && npm run build`
- [ ] `python3 -m py_compile GKS_Server/*.py`

## Checklist

- [ ] No secrets added
- [ ] Docs updated (if needed)
- [ ] Breaking changes documented

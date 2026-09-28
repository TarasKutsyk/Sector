# Proof-of-Work Menu

Pick the proof before building. If the plan does not specify one, propose 2-3
from this menu and let the user choose.

| Work type | Best proof |
|---|---|
| Web UI feature | Screenshot or short recording of the actual UI state; Playwright trace if available |
| UI polish | Before/after screenshots at desktop and mobile widths |
| Form / checkout / auth flow | Screen recording or Playwright trace + exact test account/state |
| API endpoint | Request/response transcript + targeted test |
| CLI feature | Command transcript + output file/sample |
| Library/helper | Focused tests + tiny usage example |
| Bug fix | Failing-before/passing-after test or reproduction transcript |
| Refactor | Before/after behavior check + linear diff walkthrough |
| Performance work | Before/after benchmark with command, dataset, and environment |
| Database migration | Dry-run output + rollback note + representative row counts |
| Security-sensitive change | Threat-specific checklist chosen by user + targeted verification |
| Accessibility change | Keyboard/screen-reader focused notes + screenshot/DOM evidence |
| Docs/onboarding | Fresh-run transcript following the docs from scratch |

## Artifact Rules

- Keep light human-inspectable artifacts in
  `.sector/workstreams/<workstream>/artifacts/<name>/`: one folder per plan-report
  pair, named after the `<name>` their files share, never loose in `artifacts/`.
- Do not store secrets, production data, private customer data, or sensitive
  logs in Sector artifacts.
- Heavy outputs stay wherever the project normally stores them; the report
  links only the human-inspectable proof.
- If proof cannot be saved safely, write a redacted transcript or checklist
  saying exactly what was inspected.

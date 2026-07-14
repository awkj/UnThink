# Performance budgets

`pnpm bench` exercises the CRDT paths that are most likely to regress. The default fixture uses 100,000 tasks and 10,000 individual incremental updates.

| Scenario | Budget |
| --- | ---: |
| Create 100,000 tasks and export a compact snapshot | 180 s |
| Import and materialize 100,000 tasks from a cold model | 75 s |
| Apply and materialize 10,000 incremental updates | 15 s |
| Browser cold startup to a non-empty React root | 5 s |

For a quick local smoke run, lower the fixture without changing the committed budgets: `BENCH_TASKS=1000 BENCH_UPDATES=1000 pnpm bench`.

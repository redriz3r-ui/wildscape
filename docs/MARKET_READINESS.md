# WildScape release checklist

Target: first paid pilot with a desert environmental consultancy. The user confirmed this focus and has no hosting provider or domain yet.

## Implemented and locally checked

- [x] Real Mojave regional pack, explicit attributes, source links, coordinate uncertainty, taxonomy filters and reference photos.
- [x] Project boundary, field import, habitat summaries, reviewer decisions and shareable exports.
- [x] Server-backed consultancy workspaces with session authentication and owner/editor/viewer authorization.
- [x] Scoped invitations, removal of member access, password change and recovery endpoints.
- [x] Server validation and optimistic concurrent-edit checks.
- [x] Saved revision history, activity records and private revision downloads.
- [x] Reversible project archiving.
- [x] Team candidate survey sites with signed source snapshots, rationale, version-checked status updates and reviewer-attributed assessment history.
- [x] Backup publication failure tests (mocked database commands); a separate local synthetic PostgreSQL restore rehearsal passed. Production restore remains unverified.
- [x] Separate local demo and server project storage; no silent cloud-to-local fallback.
- [x] Planner protects unsaved assessments during location changes, blocks changes during saves and exports explicitly labeled private drafts after save failures.
- [x] Production configuration, container definitions, HTTPS proxy, commercial-data asset allowlist and backup command.
- [x] Local API and browser tests for tenant boundaries, persistence, invitations, roles and conflicting saves.

## Engineering validation still required

- [ ] Build and run production containers; Docker engine currently unresponsive and Mac locked at attempted inspection.
- [x] Run database tests and two-client project/site save races against local PostgreSQL 17.11 (18 tests passed).
- [x] Rehearse backup/restore on isolated synthetic PostgreSQL databases; data hashes, private evidence, revisions and account authentication matched.
- [ ] Repeat restore rehearsal on the deployed container stack with realistic volume, independent backup storage and agreed recovery targets.
- [ ] Verify deployed TLS, email recovery, uptime alerts and operational logs.
- [ ] Validate the actual deployment with multiple simultaneous project users and realistic project sizes.
- [ ] Independent security review appropriate to sensitive ecological records.
- [ ] Accessibility review of map and key workflows with keyboard and assistive technology.

## Scientific and pilot gates

- [x] Pilot focus confirmed: Mojave desert tortoise survey planning.
- [ ] Obtain the first real project boundary and field survey scope.
- [x] Live point screening across the EPA Mojave Basin and Range ecoregion, with elevation, vegetation, critical-habitat intersection and aggregated tortoise record context.
- [x] Broad 25/50 km nearby-area ranking from count-only GBIF tortoise records, with year filters and explicit missing-source state; not a tortoise density or suitability model.
- [ ] Prepare the exact project's source pack; detailed project habitat summaries remain tied to the original bounded Mojave pack.
- [ ] Obtain authorized agency/regional sources, survey records and relevant methods for that project.
- [ ] Biologist review of species candidate completeness, taxonomy, habitat interpretation and source suitability.
- [ ] Compare findings with completed surveys; record missing candidates, spatial mismatches and misleading interpretations.
- [ ] Confirm the assessment/report format meets the pilot consultancy's needs.

## External launch decisions

- [ ] Hosting account, domain, production secrets and mail service.
- [ ] Client data-handling agreement, privacy/retention terms and sensitive-data access rules.
- [ ] Pricing, support commitment and pilot agreement; billing processor if self-service subscriptions are desired.
- [ ] Independent backups, incident owner and tested recovery procedure.
- [ ] First pilot acceptance by practicing desert biologists.

Current claim: functional local consultancy SaaS foundation with a real-data screening workflow. Do not label it market-ready, field-validated, an exhaustive species inventory, or a protocol-compliant survey system until the corresponding gates are satisfied.

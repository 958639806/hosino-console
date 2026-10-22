# HOSINO-TOOLCAT v1 (prepared 2026-10-20, NOT applied)
Target: dist/mcp-http.runtime-C0W84mMK.mjs  old 7364563c1f5c -> new 66cbd86e6943
Edits: (a) drop `nativeCronCreatorToolAllowlist !== null` from owner capture gate; (b) cache cap 2->8;
(c) observation logs owner turns too (was skipped when allowlist null). Persistence: skipped (in-memory; owner must speak once per group after each restart).
Deploy: --check; --apply; --register-manifest; release_manager.py installed-check; reapply_all.sh --check; restart gateway (needs 李).
Rollback: --revert; --unregister-manifest; restart gateway.
Tests: test/catalog_harness.mjs <file> (orig fails = reproduces live bug; patched passes), test/guard_harness.mjs (run on host).

// `VERSION` is the package version (semver of the binary itself).
// `SCHEMA_VERSION` is the workspace schema version — bumped only when the
// on-disk format (kinds, frontmatter, references) changes in a way that
// requires migration. The two drift independently.
//
// When SCHEMA_VERSION bumps, ship a `skills/migrations/v<from>-to-<to>/`
// directory; bootstrap will refuse to operate on a workspace whose
// `config.yaml#schemaVersion` is older than this constant and point the
// agent at the matching migration skill.

export const VERSION = '0.2.0';
export const SCHEMA_VERSION = '0.2.0';

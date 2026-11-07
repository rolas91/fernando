# Source language utility

Run these commands from the relevant project directory (backend, frontend or mobile). Each repository contains its own independent utility and dictionary. It processes TypeScript and JavaScript (including JSX/TSX) in `src`, `app`, `components`, `constants`, `contexts`, `hooks`, `lib`, `plugins`, `scripts`, and root-level source/config files. Missing directories are skipped. Tests and migrations are included. The utility excludes itself, dependencies, compiled assets, generated native Android/iOS directories and backups. It does not process `.env`, JSON, CSS, HTML, or native Java/Kotlin/Swift files.

## Find and translate text

```sh
npm run source:scan
```

This creates `.source-language/translations.json`, containing candidate Spanish strings, file locations, source fingerprints, and `translation: null`. Detection uses a word list and Spanish characters: it can miss Spanish and report false positives. To review every nonempty string and template fragment instead:

```sh
npm run source:scan -- --all
```

The included `scripts/source-language.translations.json` dictionary pre-fills reviewed translations for the known project messages. New, unknown text still needs a reviewed translation. Extend that dictionary or fill the catalog's `translation` field with English text. For example:

```json
{
  "text": "Usuario inválido",
  "translation": "Invalid user"
}
```

Keep the rest of each generated entry unchanged. The utility applies this local translation catalog; it is not an automatic translation service and does not send source code to an external service. A null translation leaves the original unchanged. Interpolated expressions in template literals stay intact, and placeholders such as `{name}`, `{{name}}`, and `%s` must be preserved. Translate template fragments with their surrounding sentence in mind.

Technical strings such as object keys, SQL, imports and paths require explicit `allowTechnical: true` on the entry. Review other strings too: a parser cannot prove whether a value is a database value, API contract, or visible message.

```sh
npm run source:apply
npm run source:apply -- --write
```

Without `--write`, apply only previews affected files. Changed source fingerprints stop the operation; scan again to refresh the catalog. Matching entry IDs retain their existing translations. Earlier catalogs are backed up before rescanning.

## Remove comments

```sh
npm run source:comments
npm run source:comments -- --write
```

This removes explanatory JavaScript/TypeScript comments. It preserves recognized TypeScript, ESLint, Prettier, bundler and coverage directives, triple-slash references, and comments containing @ tags (including JSDoc types). Protected comments remain byte-for-byte in the same position and on the same lines. Scan reports their count. Custom tools may use additional conventions, so review the diff. It uses the TypeScript parser, not a text replacement over slash characters. It preserves line breaks and inserts whitespace to avoid joining tokens or changing automatic semicolon insertion. Comment-looking text inside strings, regexes and template text is retained. A shebang is retained as executable syntax.

To apply translations and remove comments together:

```sh
npm run source:apply -- --remove-comments --write
```

Before writing, every planned result is syntax-checked and originals are backed up under `.source-language/backups/`. No Git commands run and nothing is committed or pushed. Review the diff and run the project's build/tests after applying changes. Use `npm run format` afterward to tidy whitespace if desired.

## Test the utility

```sh
npm run source:test
```

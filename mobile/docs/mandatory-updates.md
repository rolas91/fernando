# Mandatory store updates

Both native platforms check before mounting authenticated screens, on foreground,
and every five minutes while active. Web and Expo Go skip the check.

## Android with Google Play

The Expo plugin `plugins/with-play-update.cjs` includes the Kotlin bridge and
Play In-App Updates in new Android builds. Google Play reports whether a newer
`versionCode` is available to that installation. On detection, Android remembers
the required code and shows the update screen until the newer binary is installed.
The screen supports Google Play's in-app installation and a direct store link.
An initial check failure allows access when no newer version has been detected.
A previously detected version remains required when offline.

Publish an Android build containing the native module, then use a higher
`versionCode` to test the update through Google Play internal app sharing or a
test track. Use the same package and signing identity and a Play account with
access to both builds. The native check does not need Google service-account
credentials, GitHub Actions, or a server-side Android minimum. Android binaries
without the bridge can continue to use the legacy server policy if they already
include the server gate.

## iOS with the backend policy

iOS checks the public `GET /api/mobile/version/ios` endpoint. Older versions see
only a mandatory update screen with the App Store link and retry. The installed
binary version comes from `expo-application`, not OTA config.

## Deployment

1. Deploy the backend endpoint before distributing the app containing this gate.
2. Build and publish the iOS app. Already-installed releases without
   this gate cannot be retroactively blocked by this change.
3. For every release, increase `expo.version` in `mobile/app.json` (for example,
   `1.0.5`). EAS build-number auto-increment alone does not change this version.
4. Wait until the release is downloadable by all affected users, including their
   countries and rollout cohorts. Then set the backend environment variables for
   that platform and restart/redeploy the backend:

```dotenv
MOBILE_IOS_MIN_VERSION=1.0.5
MOBILE_IOS_STORE_URL=https://apps.apple.com/app/idYOUR_REAL_APPLE_ID
```

The iOS URL above is a placeholder: replace it with the actual App Store URL.
Versions must be numeric `major.minor.patch`. iOS and Android can be activated
independently. A configured minimum overrides the automatic policy and requires
a valid store URL. Set the minimum to `off` to disable enforcement immediately
after applying the environment change. An empty minimum uses the automatic
policy if enabled and otherwise disables enforcement.

Checks fail closed: timeout (10 seconds), network failure, malformed policy, or
server error prevents access and offers retry. An existing update screen remains
blocked if a recheck fails. Offline access therefore requires connectivity again.
Setting the minimum to `off` or lowering it lets clients recover on their next
successful check.
This is a client UI gate, not server-side rejection of older API clients.

## Container environment and store credentials

The copy/paste block is in `backend/deploy/.env.production.example` (Compose)
and `backend/.env.production.example` (standalone/CapRover). Both Dockerfiles
declare empty runtime defaults, so the next image build includes the variable
names without any private credentials.

For Compose, paste the block into the existing server-side `.env.production`;
do not replace the other settings. `compose.production.yml` already injects that
file via `env_file`. Recreate the API container on the next deployment to apply
changes. For CapRover, paste the values into the app's runtime Environment
Variables and redeploy. Changing a repository example does not change server
secrets or populate the CapRover environment editor automatically.

## Automatic release checking

1. Apply the `CreateMobileVersionPolicies20261127001000` database migration before
   enabling synchronization. The production Compose migration service can apply
   it. For deployments that do not run migrations automatically, use the normal
   backend migration command before enabling either platform.
2. Set `MOBILE_IOS_AUTO_UPDATE=true`.
   Leave the corresponding `MIN_VERSION` empty to use the stored minimum.
   Set the store URL and `STORE_COUNTRIES` for each platform. List all storefront
   countries your users rely on as comma-separated two-letter codes (for example,
   `US,CA`).
3. Configure App Store Connect credentials in the server environment.

Leave `MOBILE_ANDROID_AUTO_UPDATE=false` when using the native Android flow.
If you intentionally use automatic policy for older Android binaries, record each
release's real EAS `versionCode` and binary version in
`MOBILE_ANDROID_VERSION_CODES` (for example, `{"42":"1.0.5","43":"1.0.6"}`).
Update that mapping as part of releasing a new Android build. An unknown code
or a mixture of binary versions in the completed track prevents promotion.
Give the polling task its own Google service account so it does not share
an edit identity with release tooling. The task discards its edit without
committing any changes to Google Play.

The backend checks both platforms independently at startup and every 15 minutes.
iOS requires a release ready for distribution and the matching version visible
in each configured storefront. Android requires a completed production rollout
and availability in each configured country. A candidate must still be eligible
when checked at least six hours after it was first observed. Store errors keep
the last confirmed minimum. The public version endpoint reads the confirmed
policy from the database without waiting for Apple or Google.

Storefront checks cannot confirm install eligibility for every device. Review
device and OS compatibility before releasing a version that will be enforced.
For a rollback, pin the minimum explicitly or set it to `off`. Removing the
override restores the last confirmed automatic minimum.

Use the numeric app Apple ID, App Store Connect issuer/key IDs, and single-line
base64 encodings of the entire Apple `.p8` file and Google service-account JSON.
Base64 values remain secrets. Store actual values only in the server environment,
never in example files, Dockerfiles, build arguments, or source control.

## Device acceptance checklist

On a release build on each platform: test lower/equal/newer installed versions,
cold launch, resume, foreground polling, notification links, Android back, store
opening failure, offline launch, and recovery after a minimum rollback. A lower
version must never expose login or work screens; returning from the store without
installing must remain blocked. Test the actual store URLs before activation.

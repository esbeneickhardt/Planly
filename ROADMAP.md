# Roadmap

Planly is actively developed by a single maintainer. This is a lightweight, living list of what's planned next - not a fixed timeline, and not exhaustive.

## Planned

- **Push notifications for mobile** - the in-app notification bell only works while the app is open. Chat is the most time-sensitive case (a `@mention` or a new direct message), so that's the first target. This needs new infrastructure that doesn't exist yet: a service worker, a PWA install prompt (iOS Safari only supports Web Push for a PWA added to the home screen, not a regular browser tab), and a VAPID-based push subscription flow on the backend.

## Suggesting something

Have an idea or run into a pain point? Open a [GitHub Issue](https://github.com/esbeneickhardt/Planly/issues) - see [CONTRIBUTING.md](CONTRIBUTING.md) for the current state of external contributions.

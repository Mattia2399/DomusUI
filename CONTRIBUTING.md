# Contributing to Domus UI

Thank you for helping improve Domus UI. Before starting a substantial change, open a Discussion or an issue so its goal and compatibility with the roadmap can be agreed upon.

## Development setup

Node.js 22.22.0 or newer is required.

```bash
npm ci
npm run dev
```

## Pull requests

- Keep each pull request focused on one problem.
- Never include tokens, PINs, Home Assistant URLs, real household data, or personal screenshots.
- Preserve accessibility, Light/Dark themes, and supported breakpoints.
- Explain how you verified the behavior you changed.
- Document visible changes, migrations, and hardware limitations.
- Run `npm run release:gate` before requesting review.

Contributions submitted to this repository are distributed under the project's GPL-3.0 license. By opening a pull request, you confirm that you have the right to license the submitted code under those terms.

## Security

Do not use public issues or pull requests for vulnerabilities. Follow [SECURITY.md](SECURITY.md).

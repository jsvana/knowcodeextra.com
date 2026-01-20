# Changelog

## [0.3.1] - 2026-01-19

### Changed
- Refactor frontend into modular file structure (index.jsx entry point, app.jsx, admin components)

## [0.2.4] - 2026-01-18

### Fixed
- Simplified config loading to directly override from env vars after deserialize

## [0.2.3] - 2026-01-18

### Fixed
- Explicitly map KNOWCODE_ADMIN_* env vars to config fields (fixes admin auth)

## [0.2.2] - 2026-01-18

### Fixed
- Environment variable config parsing now uses double underscore separator, fixing admin authentication with KNOWCODE_ADMIN_* variables

## [0.2.1] - 2026-01-18

### Fixed
- Release workflow now installs frontend dependencies before building

## [0.2.0] - 2026-01-18

### Added
- Admin portal with JWT authentication
  - Dashboard with statistics and recent activity
  - Queue management with approve/reject functionality
  - Approved members list with pagination
  - Search functionality
  - Settings page
- Ham2K PoLo callsign notes export at /members.txt
- Favicon with Morse code K (dash-dot-dash) design
- Production Tailwind CSS build (replaces CDN)
- Audio player elapsed time display
- Segment markers on audio visualization
- Audio progress tracking at submission time
- Rate limit: one test attempt per day per callsign
- Audio replay blocking during active test
- Custom modals with rate limit warnings

### Changed
- Format all Rust and JavaScript code

## [0.1.1] - 2026-01-17

### Changed
- Update divider

## [0.1.0] - 2026-01-18

- Initial release

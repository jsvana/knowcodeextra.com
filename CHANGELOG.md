# Changelog

## [0.5.0] - 2026-01-19

### Added
- Prosign mapping editing in admin UI (inline edit with save/cancel)
- Copy text preview in test list (shows status with color coding)

### Changed
- Renamed test "Edit" button to "Copy Text" for clarity

## [0.4.0] - 2026-01-19

### Added
- Grading module with copy text validation and prosign support
- Prosign mapping system with admin management endpoints
- All Attempts admin tab with filtering
- Recent attempts section in admin dashboard and stats
- Expected copy text field for admin test management
- Submit button now only appears when audio finished and all questions answered
- Pass reason display (questions, copy, or both) on results page
- Consecutive correct character count on results page
- Prosign usage instructions on test page

### Fixed
- Use parameterized queries and add input validation in list_all_attempts
- Input validation and error handling for prosign endpoints
- Store actual copy_text length in copy_chars column

### Changed
- Test submission now uses centralized grading module
- Conditionally show approve/reject buttons only for passing attempts

## [0.3.2] - 2026-01-19

### Fixed
- Include all JSX files in Tailwind CSS build (fixes admin portal styling)

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

# Implementation Plan

- [x] 1. Add watching/serials API endpoint to KinoPubClient
  - Add `getWatchingSerials()` method to KinoPubClient class
  - Implement API call to `/v1/watching/serials` endpoint
  - Add proper TypeScript interfaces for watching serials response
  - _Requirements: 7.1_

- [x] 2. Create scan-watched CLI script
  - Create `src/scripts/scan-watched.ts` file
  - Implement logic to filter for fully watched TV shows only
  - Add JSON file writing functionality to save watched shows
  - Add CLI command to package.json scripts
  - _Requirements: 7.1_

- [x] 3. Add bookmark folder search to KinoPubClient
  - Add method to find bookmark folder by name ("tv-shows-ai")
  - Add method to create bookmark folder if it doesn't exist
  - Handle folder not found scenarios gracefully
  - _Requirements: 7.2_

- [x] 4. Create scan-bookmarks CLI script
  - Create `src/scripts/scan-bookmarks.ts` file
  - Implement logic to find and scan "tv-shows-ai" bookmark folder
  - Add JSON file writing functionality to save bookmarked shows
  - Add CLI command to package.json scripts
  - _Requirements: 7.2_

- [x] 5. Add Anthropic API integration
  - Install @anthropic-ai/sdk package
  - Create AnthropicClient service class
  - Add ANTHROPIC_API_KEY to .env.example
  - Implement recommendation generation method
  - _Requirements: 7.3_

- [x] 6. Create ai-recommend CLI script
  - Create `src/scripts/ai-recommend.ts` file
  - Load watched shows and existing bookmarks from JSON files
  - Generate AI recommendations using Anthropic API
  - Add recommended shows to "tv-shows-ai" bookmark folder
  - Add CLI command to package.json scripts
  - _Requirements: 7.3_
# Kino.pub AI Bookmarks

AI-powered bookmark management for kino.pub using Anthropic's Claude API.

## Features

- Scan and analyze watched content from kino.pub
- AI-powered content rating and recommendations
- Bookmark management with intelligent categorization
- SQLite database for local data storage

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment file and configure:
   ```bash
   cp .env.example .env
   ```

4. Add your API credentials to `.env`:
   - `KINO_PUB_ACCESS_TOKEN`: Your kino.pub access token
   - `ANTHROPIC_API_KEY`: Your Anthropic API key

## Usage

### Build the project
```bash
npm run build
```

### Run scripts

- Scan watched content: `npm run scan-watched`
- Scan bookmarks: `npm run scan-bookmarks`
- Rate content with AI: `npm run rate-content`
- Get AI recommendations: `npm run ai-recommend`

## Database

The project uses SQLite for data storage. See `README-DATABASE.md` for database schema details.

## License

MIT
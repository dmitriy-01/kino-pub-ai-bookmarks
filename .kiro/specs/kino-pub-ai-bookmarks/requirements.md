# Requirements Document

## Introduction

This feature will create a TypeScript application that connects to kino.pub to automatically manage bookmarks (favorites) using AI-powered recommendations. The system will authenticate with kino.pub, analyze user preferences, suggest new movies and TV shows, and maintain an organized bookmark collection.

## Requirements

### Requirement 1

**User Story:** As a kino.pub user, I want the system to authenticate with my kino.pub account, so that it can access and manage my favorites list.

#### Acceptance Criteria

1. WHEN the application starts THEN the system SHALL read kino.pub credentials from .env file
2. WHEN valid credentials are loaded THEN the system SHALL successfully authenticate and maintain session
3. WHEN authentication fails THEN the system SHALL display clear error messages and check .env configuration
4. WHEN session expires THEN the system SHALL automatically re-authenticate using .env credentials

### Requirement 2

**User Story:** As a user, I want the system to analyze my current favorites and viewing history, so that it can understand my preferences for AI recommendations.

#### Acceptance Criteria

1. WHEN authenticated THEN the system SHALL retrieve all current favorites from kino.pub
2. WHEN favorites are retrieved THEN the system SHALL extract metadata (genre, year, rating, actors, directors)
3. WHEN analyzing preferences THEN the system SHALL identify patterns in user's favorite content
4. WHEN preference analysis is complete THEN the system SHALL store preference profile for recommendation engine

### Requirement 3

**User Story:** As a user, I want the system to suggest new movies and TV shows based on my preferences, so that I can discover content I'm likely to enjoy.

#### Acceptance Criteria

1. WHEN preference analysis is complete THEN the system SHALL generate AI-powered content recommendations
2. WHEN generating recommendations THEN the system SHALL consider genre preferences, rating thresholds, and release years
3. WHEN recommendations are generated THEN the system SHALL rank them by relevance score
4. WHEN presenting recommendations THEN the system SHALL include title, description, rating, and reasoning

### Requirement 4

**User Story:** As a user, I want the system to automatically add recommended content to my kino.pub favorites, so that I can easily find suggested content later.

#### Acceptance Criteria

1. WHEN recommendations are approved THEN the system SHALL add selected items to kino.pub favorites
2. WHEN adding favorites THEN the system SHALL verify the content exists on kino.pub
3. WHEN content is not found THEN the system SHALL log the issue and skip that recommendation
4. WHEN favorites are added THEN the system SHALL confirm successful addition and update local records

### Requirement 5

**User Story:** As a user, I want the system to organize my bookmarks with tags and categories, so that I can easily browse my collection.

#### Acceptance Criteria

1. WHEN processing favorites THEN the system SHALL automatically tag content by genre, year, and type
2. WHEN organizing bookmarks THEN the system SHALL create logical categories (e.g., "To Watch", "Recommended", "Classics")
3. WHEN content is categorized THEN the system SHALL update kino.pub favorites with appropriate tags
4. WHEN organization is complete THEN the system SHALL provide a summary of bookmark structure

### Requirement 6

**User Story:** As a user, I want the system to run periodically to maintain fresh recommendations, so that I always have new content suggestions.

#### Acceptance Criteria

1. WHEN configured THEN the system SHALL run automatically on a specified schedule
2. WHEN running periodically THEN the system SHALL check for new content on kino.pub
3. WHEN new content matches preferences THEN the system SHALL add it to recommendations queue
4. WHEN recommendations queue is full THEN the system SHALL notify user of new suggestions

### Requirement 7

**User Story:** As a user, I want CLI scripts for TV show recommendations, so that I can discover new content based on my viewing history.

#### Acceptance Criteria

1. WHEN running scan-watched THEN the system SHALL get fully watched TV shows from `/v1/watching/serials` and save to JSON
2. WHEN running scan-bookmarks THEN the system SHALL get "tv-shows-ai" folder items and save to JSON  
3. WHEN running ai-recommend THEN the system SHALL use Anthropic API to suggest new shows and add to "tv-shows-ai" folder


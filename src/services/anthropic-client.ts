import Anthropic from '@anthropic-ai/sdk';
import { WatchedItem, BookmarkedItem } from './database';

export class AnthropicClient {
  private client: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.client = new Anthropic({
      apiKey: key,
    });
  }

  /**
   * Generate recommendations based on watched items with user preferences and existing bookmarks
   */
  async generateRecommendations(
    watchedItems: WatchedItem[],
    bookmarkedItems: BookmarkedItem[],
    contentType: 'movie' | 'serial' | 'both' = 'both'
  ): Promise<string[]> {
    const prompt = this.buildRecommendationPrompt(watchedItems, bookmarkedItems, contentType);

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        return this.parseRecommendations(content.text);
      }

      throw new Error('Unexpected response format from Anthropic API');
    } catch (error) {
      console.error('Error generating recommendations:', error);
      throw error;
    }
  }

  private buildRecommendationPrompt(
    watchedItems: WatchedItem[],
    bookmarkedItems: BookmarkedItem[],
    contentType: 'movie' | 'serial' | 'both'
  ): string {
    // Separate items by rating and notes
    const lovedItems = watchedItems.filter(item =>
      item.userRating && item.userRating >= 8
    );
    const likedItems = watchedItems.filter(item =>
      item.userRating && item.userRating >= 6 && item.userRating < 8
    );
    const dislikedItems = watchedItems.filter(item =>
      item.userRating && item.userRating < 6
    );
    const unratedItems = watchedItems.filter(item => !item.userRating);

    const formatItem = (item: WatchedItem) => {
      const yearStr = item.year ? ` (${item.year})` : '';
      const ratingStr = item.userRating ? ` [Rating: ${item.userRating}/10]` : '';
      const notesStr = item.userNotes ? ` - ${item.userNotes}` : '';
      return `${item.title}${yearStr}${ratingStr}${notesStr}`;
    };

    const bookmarkedTitles = bookmarkedItems.map(item => {
      const yearStr = item.year ? ` (${item.year})` : '';
      return `${item.title}${yearStr}`;
    });

    const contentTypeText = contentType === 'both' ? 'movies and TV shows' :
      contentType === 'movie' ? 'movies' : 'TV shows';

    let prompt = `Based on my viewing history and preferences, please recommend ${contentTypeText} I would enjoy.\n\n`;

    if (lovedItems.length > 0) {
      prompt += `CONTENT I LOVED (8-10/10):\n${lovedItems.map(formatItem).join('\n')}\n\n`;
    }

    if (likedItems.length > 0) {
      prompt += `CONTENT I LIKED (6-7/10):\n${likedItems.map(formatItem).join('\n')}\n\n`;
    }

    if (dislikedItems.length > 0) {
      prompt += `CONTENT I DISLIKED (1-5/10) - AVOID SIMILAR:\n${dislikedItems.map(formatItem).join('\n')}\n\n`;
    }

    if (unratedItems.length > 0) {
      prompt += `OTHER WATCHED CONTENT - DO NOT RECOMMEND THESE:\n${unratedItems.map(formatItem).join('\n')}\n\n`;
    }

    if (bookmarkedTitles.length > 0) {
      prompt += `ALREADY BOOKMARKED - DO NOT RECOMMEND THESE:\n${bookmarkedTitles.join('\n')}\n\n`;
    }

    // Create a comprehensive exclusion list
    const allWatchedTitles = watchedItems.map(item => {
      const yearStr = item.year ? ` (${item.year})` : '';
      return `${item.title}${yearStr}`;
    });

    const allExcludedTitles = [...allWatchedTitles, ...bookmarkedTitles];

    if (allExcludedTitles.length > 0) {
      prompt += `COMPLETE EXCLUSION LIST - NEVER RECOMMEND ANY OF THESE:\n${allExcludedTitles.join('\n')}\n\n`;
    }

    prompt += `Please recommend 8-12 ${contentTypeText} that I would likely enjoy based on my preferences. Consider:
1. My ratings and notes to understand what I like/dislike
2. Patterns in genres, themes, and styles I enjoy
3. Avoid content similar to what I disliked
4. NEVER recommend anything from the EXCLUSION LIST above
5. Include both popular and hidden gems
6. Mix of recent releases and classics
7. Focus on internationally popular content that would be available on streaming platforms

IMPORTANT: Provide titles in English only for consistency with search.

Format your response as a simple list, one per line:
Title (Year)

Do not include explanations, just the list.`;

    return prompt;
  }

  private parseRecommendations(text: string): string[] {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.includes('(') && line.includes(')'))
      .slice(0, 12); // Allow up to 12 recommendations
  }
}
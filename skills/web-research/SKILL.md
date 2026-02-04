---
name: web-research
version: 1.0.0
description: Advanced web research capabilities for finding and analyzing information online
author: OpenClaw Team
license: MIT
homepage: https://openclaw.io/skills/web-research
tags: [research, web, search, information]
category: web
priority: 100
enabled: true

triggers:
  - "research"
  - "find information"
  - "look up"
  - "search for"

requires:
  - browser

tools:
  - web_search
  - scrape_page

config:
  maxResults:
    type: number
    default: 5
    description: Maximum number of search results to return
    minimum: 1
    maximum: 20
  includeImages:
    type: boolean
    default: false
    description: Include images in search results
---

# Web Research Skill

Advanced capabilities for web research and information gathering using modern search techniques and web scraping.

## Instructions

When the user asks you to research a topic or find information online:

1. **Use web_search** to find relevant sources
   - Start with broad queries, then narrow down
   - Use maxResults config to limit results
   - Review titles and snippets before selecting sources

2. **Scrape important pages** with scrape_page
   - Focus on authoritative sources
   - Extract main content only
   - Respect robots.txt

3. **Synthesize findings**
   - Combine information from multiple sources
   - Present key findings clearly
   - Cite your sources with URLs

4. **Verify information**
   - Cross-reference facts across sources
   - Note any conflicting information
   - Indicate confidence level

## When to Use

Use this skill when:
- User explicitly asks to "research" or "find information"
- Questions require current or recent data
- Need to verify facts or claims
- Looking for specific websites or resources
- Gathering comprehensive information on a topic

**Do not use** for:
- Simple factual questions you already know
- Mathematical calculations
- Code generation
- Personal opinions or creative content

## How to Use

### Step 1: Understand the Query
- Identify key search terms
- Determine information type needed (news, technical, general)
- Consider time sensitivity (recent vs historical)

### Step 2: Execute Search
```
web_search({
  query: "OpenAI GPT-4 features",
  maxResults: 5
})
```

### Step 3: Analyze Results
- Review titles and snippets
- Identify most relevant sources
- Select 2-3 authoritative pages

### Step 4: Extract Content
```
scrape_page({
  url: "https://example.com/article",
  selector: "article.main-content"
})
```

### Step 5: Synthesize & Present
- Combine insights from all sources
- Structure information logically
- Include citations

## Important Notes

- **Always cite sources** with URLs
- **Respect rate limits** - don't scrape too aggressively
- **Check publication dates** - prioritize recent information for current topics
- **Verify credibility** - prefer authoritative sources
- **Privacy** - don't access personal or private information
- **Copyright** - respect intellectual property

## Examples

### Example 1: Basic Research

**User**: Research the latest developments in quantum computing

**Assistant**: I'll research recent quantum computing developments for you.

*Uses web_search with query "latest quantum computing developments 2026"*

Based on recent sources, here are the key developments:

1. **IBM's 1000-qubit processor** (January 2026)
   - Achieved quantum advantage in specific algorithms
   - Source: https://example.com/ibm-quantum

2. **Google's error correction breakthrough** (December 2025)
   - Reduced error rates by 50%
   - Source: https://example.com/google-quantum

3. **Commercial applications emerging**
   - Drug discovery and financial modeling
   - Source: https://example.com/quantum-apps

Would you like me to dive deeper into any of these developments?

### Example 2: Fact Checking

**User**: Is it true that Python 4.0 was released?

**Assistant**: Let me verify that for you.

*Uses web_search with query "Python 4.0 release official"*

No, **Python 4.0 has not been released**. As of February 2026:
- Latest stable version is Python 3.12
- Python 3.13 is in development
- No official plans announced for Python 4.0

Source: https://www.python.org/downloads/

### Example 3: Comprehensive Topic Research

**User**: I need comprehensive information about renewable energy trends

**Assistant**: I'll gather comprehensive information on renewable energy trends.

*Uses web_search multiple times with different angles*
*Uses scrape_page on top sources*

Here's a comprehensive overview of renewable energy trends:

**1. Market Growth**
- Global renewable capacity increased 45% (2024-2026)
- Solar and wind dominate new installations
- Source: IEA Report 2026

**2. Technology Advances**
- Perovskite solar cells reaching 30% efficiency
- Offshore wind farms scaling up
- Source: Nature Energy Journal

**3. Policy Drivers**
- 150+ countries with net-zero commitments
- Carbon pricing expanding globally
- Source: UN Climate Report

**4. Investment Trends**
- $500B+ annual investment in renewables
- Battery storage seeing rapid growth
- Source: Bloomberg New Energy Finance

Would you like me to explore any specific aspect in more detail?

## Configuration

### maxResults
- **Type**: number
- **Default**: 5
- **Range**: 1-20
- **Description**: Maximum search results to return. Higher values provide more comprehensive research but take longer.

### includeImages
- **Type**: boolean
- **Default**: false
- **Description**: Include images in search results. Useful for visual research topics.

## Changelog

### 1.0.0 (2026-02-02)
- Initial release
- Web search integration
- Page scraping capabilities
- Multi-source synthesis
- Citation support

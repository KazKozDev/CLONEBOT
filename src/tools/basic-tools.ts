/**
 * Basic Tools for Agent
 * 
 * Простые инструменты которые агент может использовать:
 * - calculator: математические вычисления
 * - get_time: текущее время
 * - search_web: поиск в интернете (заглушка)
 */

export const basicTools = [
  {
    name: 'calculator',
    description: 'Выполняет математические вычисления. Принимает выражение в виде строки (например "2 + 2", "10 * 5 + 3").',
    inputSchema: {
      type: 'object' as const,
      properties: {
        expression: {
          type: 'string',
          description: 'Математическое выражение для вычисления',
        },
      },
      required: ['expression'],
    },
    handler: async ({ expression }: { expression: string }) => {
      try {
        // Безопасное вычисление только математических операций
        const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
        const result = eval(sanitized);
        
        return {
          content: String(result),
          data: { result, expression: sanitized },
          success: true,
        };
      } catch (error: any) {
        return {
          content: `Error: ${error.message}`,
          error: error.message,
          success: false,
        };
      }
    },
  },
  
  {
    name: 'get_time',
    description: 'Возвращает текущее время и дату в разных форматах',
    inputSchema: {
      type: 'object' as const,
      properties: {
        timezone: {
          type: 'string',
          description: 'Временная зона (например "Europe/Moscow", "America/New_York")',
        },
        format: {
          type: 'string',
          description: 'Формат вывода: "full" (полный), "time" (только время), "date" (только дата)',
          enum: ['full', 'time', 'date'],
        },
      },
      required: [],
    },
    handler: async ({ timezone = 'Europe/Moscow', format = 'full' }: { timezone?: string; format?: string }) => {
      try {
        const now = new Date();
        
        const options: Intl.DateTimeFormatOptions = {
          timeZone: timezone,
          ...(format === 'full' ? {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
          } : format === 'time' ? {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          } : {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        };
        
        const formatted = new Intl.DateTimeFormat('ru-RU', options).format(now);
        
        return {
          content: formatted,
          data: {
              timestamp: now.getTime(),
              formatted,
              timezone,
              iso: now.toISOString(),
          },
          success: true,
        };
      } catch (error: any) {
        return {
          content: `Error: ${error.message}`,
          error: error.message,
          success: false,
        };
      }
    },
  },
  
  {
    name: 'get_weather',
    description: 'Возвращает информацию о погоде в указанном городе (OpenMeteo API).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        city: {
          type: 'string',
          description: 'Название города',
        },
      },
      required: ['city'],
    },
    handler: async ({ city }: { city: string }) => {
      try {
        // 1. Geocoding
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru&format=json`;
        const geoRes = await fetch(geoUrl, {
            headers: { 'User-Agent': 'CLONEBOT/1.0' }
        });
        if (!geoRes.ok) throw new Error(`Geocoding failed: ${geoRes.statusText}`);
        const geoData = await geoRes.json() as any;

        if (!geoData.results || geoData.results.length === 0) {
            return { content: `City "${city}" not found.`, error: 'Not found', success: false };
        }

        const { latitude, longitude, name, country } = geoData.results[0];

        // 2. Weather
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&wind_speed_unit=ms`;
        const weatherRes = await fetch(weatherUrl, {
             headers: { 'User-Agent': 'CLONEBOT/1.0' }
        });
        if (!weatherRes.ok) throw new Error(`Weather API failed: ${weatherRes.statusText}`);
        const weatherData = await weatherRes.json() as any;
        
        const current = weatherData.current;
        
        // Map WMO code to string (simplified)
        const wmo: Record<number, string> = {
            0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
            45: 'Fog', 48: 'Depositing rime fog',
            51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
            61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
            71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
            95: 'Thunderstorm'
        };
        const condition = wmo[current.weather_code] || `Code ${current.weather_code}`;

        const desc = `Weather in ${name}, ${country}: ${current.temperature_2m}${weatherData.current_units.temperature_2m}, ${condition}, humidity ${current.relative_humidity_2m}%`;

        return {
          content: desc,
          data: {
            city: name,
            country,
            coordinates: { lat: latitude, lon: longitude },
            temperature: current.temperature_2m,
            unit: weatherData.current_units.temperature_2m,
            humidity: current.relative_humidity_2m,
            condition,
            windSpeed: current.wind_speed_10m
          },
          success: true,
        };
      } catch (error: any) {
        return {
          content: `Error: ${error.message}`,
          error: error.message,
          success: false,
        };
      }
    },
  },
  
// Mock implementation of browser_navigate removed as it used simple fetch.
// The agent should use the Real Browser Controller tools (browser.navigate) instead.

  

// Mock implementation of browser_search removed as requested by user.
// The agent should use the Real Browser Controller tools (browser.navigate, browser.scan, etc.) instead.

];

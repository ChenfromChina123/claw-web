/**
 * 天气查询插件
 *
 * 这是一个示例插件，展示如何开发工具型插件
 */

/**
 * 模拟天气数据
 * 实际项目中应该调用真实的天气 API
 */
const mockWeatherData: Record<string, {
  temp: number
  condition: string
  humidity: number
  wind: number
}> = {
  '北京': { temp: 22, condition: '晴', humidity: 45, wind: 3 },
  '上海': { temp: 25, condition: '多云', humidity: 60, wind: 4 },
  '广州': { temp: 28, condition: '阵雨', humidity: 80, wind: 5 },
  '深圳': { temp: 27, condition: '晴', humidity: 55, wind: 3 },
  '成都': { temp: 20, condition: '阴', humidity: 70, wind: 2 },
}

/**
 * 获取工具列表
 */
export function getTools() {
  return [
    {
      name: 'weather_query',
      description: '查询指定城市的天气信息',
      inputSchema: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称（中文）'
          }
        },
        required: ['city']
      },
      async handler(params) {
        const { city } = params

        if (!city || typeof city !== 'string') {
          return {
            success: false,
            error: '请提供有效的城市名称'
          }
        }

        // 模拟 API 调用延迟
        await new Promise(resolve => setTimeout(resolve, 100))

        const weather = mockWeatherData[city]

        if (!weather) {
          return {
            success: false,
            error: `未找到城市 "${city}" 的天气数据`
          }
        }

        const output = `
【${city}】天气预报

🌡️ 温度: ${weather.temp}°C
🌤️ 天气: ${weather.condition}
💧 湿度: ${weather.humidity}%
🌬️ 风速: ${weather.wind}级
`.trim()

        return {
          success: true,
          output,
          metadata: {
            city,
            ...weather
          }
        }
      }
    },
    {
      name: 'weather_forecast',
      description: '获取城市未来几天的天气预报',
      inputSchema: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称（中文）'
          },
          days: {
            type: 'number',
            description: '预报天数（1-7）',
            default: 3
          }
        },
        required: ['city']
      },
      async handler(params) {
        const { city, days = 3 } = params

        if (!city || typeof city !== 'string') {
          return {
            success: false,
            error: '请提供有效的城市名称'
          }
        }

        // 验证天数
        const forecastDays = Math.min(Math.max(1, days), 7)

        // 模拟 API 调用延迟
        await new Promise(resolve => setTimeout(resolve, 150))

        // 生成模拟预报数据
        const baseWeather = mockWeatherData[city] || { temp: 20, condition: '未知', humidity: 50, wind: 3 }
        const forecasts = []

        for (let i = 0; i < forecastDays; i++) {
          const date = new Date()
          date.setDate(date.getDate() + i)

          forecasts.push({
            date: date.toISOString().split('T')[0],
            temp: baseWeather.temp + Math.floor(Math.random() * 6) - 3,
            condition: ['晴', '多云', '阴', '阵雨'][Math.floor(Math.random() * 4)],
            humidity: baseWeather.humidity + Math.floor(Math.random() * 20) - 10,
          })
        }

        let output = `【${city}】未来${forecastDays}天天气预报\n\n`

        for (const f of forecasts) {
          output += `📅 ${f.date}\n`
          output += `   🌡️ ${f.temp}°C | ${f.condition} | 💧${f.humidity}%\n\n`
        }

        return {
          success: true,
          output: output.trim(),
          metadata: {
            city,
            forecasts
          }
        }
      }
    }
  ]
}

/**
 * 插件启用时调用
 */
export function onEnable() {
  console.log('[WeatherPlugin] 天气查询插件已启用')
  return true
}

/**
 * 插件禁用时调用
 */
export function onDisable() {
  console.log('[WeatherPlugin] 天气查询插件已禁用')
}

import { basicTools } from './tools/basic-tools';

async function test() {
    console.log('--- Testing Real Weather Tool ---');
    const weatherTool = basicTools.find(t => t.name === 'get_weather');
    if (!weatherTool) {
        console.error('Weather tool not found');
        return;
    }
    
    // Test 1: Real City
    console.log('\n1. Requesting weather for: London');
    try {
        const result = await (weatherTool.handler as any)({ city: 'London' });
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (e: any) {
        console.error('Failed:', e.message);
    }
}

test().catch(err => console.error('Script Error:', err));
